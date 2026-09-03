/**
 * AgentFab — 智慧代理浮動開關鈕(AgentPanel 家族附屬資產)+ AgentFabDock(「家 ↔ 貼邊」兩態定位殼)。
 *
 * ── 消費的 SSOT ──
 * - 40 圓 = --field-height-lg 於 lg 密度(uiSize.spec.md「lg 密度」表);圓形 iconOnly。
 * - 面 = bg-surface-raised + --elevation-200(elevation.spec.md 配對規則;不寫死白色)。
 * - 外框 = AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱;
 *   spec「FAB」節)。配色兩極 = AgentLogo AGENT_BRAND(= 自家色階 blue-4 / purple-4;
 *   單一數值來源在 agent-logo.tsx,本檔只 import)。
 * - 內置 24 標誌;貼邊態內置 16 標誌(同一造型,無簡化檔)。
 * - 動畫:待機=靜止;有新訊=招喚態(標誌本體蓄勢,漣漪由邊框光圈代位:0–35% 貼邊聚亮 →
 *   35% 呼氣起點自邊框射出 r 21→27、寬 2.5、.35→0 → 90% 散盡 → 靜止空拍;與標誌同 dur /
 *   同 keyTimes / 同 swell→settle,同一 commit 掛載 → 同相);懸停=陰影升一級+微放大。
 * - 兩態定位(AgentFabDock;2026-09-03 user 第四輪拍板,取代前三輪的自由座標):只有兩種合法位置 ——
 *   「家」= 40 圓鈕,位置唯一在右下角(離右、下各 loose);「貼邊」= 28 半圓貼右緣,只有 y 可變(右緣帶內)。
 *   拖 40 圓鈕:鈕跟著游標;整段拖曳期間右緣帶(寬 36 = --field-height-md;上緣 = 貼邊鈕圓心落在視窗中線,
 *   下緣 = 貼邊鈕底 ≥ 家頂 − loose;user 2026-09-03 留言拍板:圓心從中線起、只能往下拖到家上方一個 loose,
 *   貼邊區在下半部、永不與家重疊)以底色標出(primary-subtle、貼右緣、內側圓角;見 SNAP_ZONE_CLASSES);游標一進帶內,
 *   預覽當場變成 28 半圓**貼在右緣、停在放開會落的高度**
 *   (帶內所見即所得),放開就落定;放開在帶外 → 飛回家。
 *   拖 28 小鈕:不顯示帶;帶內沿 y 移動;一出帶外當場變回 40 圓、放開飛回家(帶外沒有自由位置)。
 *   兩態點一下都直接開面板;< 8px 位移視為點擊。鍵盤:家 → 貼邊(停在帶底);貼邊 ↑↓ 16px、← / Home 回家;
 *   Shift+F10 開選單;拖曳中 Esc 取消。右鍵選單依狀態只給一項(家:縮小按鈕 ArrowRightToLine;貼邊:放大按鈕
 *   ArrowLeftFromLine —— 線 = 右緣、箭頭方向 = 鍵盤 → / ← 等價路徑;lucide 官方 tags collapse / expand 鏡像對
 *   https://github.com/lucide-icons/lucide/blob/main/icons/arrow-right-to-line.json)。
 *   Tooltip 兩態不同:家「問我或推走我」(邀請拖曳)/ 貼邊「開啟智慧代理」(user 2026-09-03:小鈕只寫開啟)。
 *   動作:形態切換 --motion-duration-overlay(150ms,Carbon moderate-01「小型展開、短距離」)、飛回家 / 落點修正
 *   --motion-duration-surface(250ms,Atlassian transitions 150–400「較長時長幫助追蹤空間變化」)+ enter 曲線、
 *   帶底色淡入淡出 150ms;prefers-reduced-motion 全部直接落定(motion.spec.md a11y 段;Atlassian / Fluent 同)。
 *   位置由 consumer 受控/非受控(placement / defaultPlacement / onPlacementChange),DS 不寫 storage。
 * - 減動作:光圈屬常駐位移 loop → prefers-reduced-motion 全停(標誌內部自回靜止)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { ArrowLeftFromLine, ArrowRightToLine } from 'lucide-react'
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
/** 環向漸層(同 AgentLogo 兩緞帶代表色;藍在左下 = 220° 起點)。 */
const RING_GRADIENT = `conic-gradient(from 220deg, ${AGENT_BRAND.blue}, ${AGENT_BRAND.purple}, ${AGENT_BRAND.blue})`

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
          style={{ background: RING_GRADIENT }}
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

/* ────────────────────────────────────────────────────────────────────────────
 * AgentFabDock — 「家 ↔ 貼邊」兩態定位殼:拖曳 + 右緣帶磁吸,所見即所得(spec「AgentFab」節「收到邊」)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 位置:home = 40 圓鈕在右下角(位置唯一,不記座標);dock = 28 半圓貼右緣,只記 y(鈕頂到舞台頂,px,
 * 由元件夾在右緣帶內)。沒有第三種位置 —— 放開在帶外一律回家,使用者不可能把鈕拖到難用的地方。
 */
export type AgentFabPlacement = { kind: 'home' } | { kind: 'dock'; y: number }

/** 預設位置:家(右下角)。 */
export const AGENT_FAB_HOME: AgentFabPlacement = { kind: 'home' }

type Shape = AgentFabPlacement['kind']
interface Point {
  x: number
  y: number
}
interface Rect extends Point {
  w: number
  h: number
}
/** 舞台(offsetParent)尺寸與 loose 內距(px)。 */
interface Stage {
  w: number
  h: number
  inset: number
}

/** 主鈕直徑(= --field-height-lg 於 lg 密度 40)。 */
const FAB_PX = 40
/** 貼邊鈕高 / 露出寬(= --field-height-sm 28)。 */
const DOCK_PX = 28
/** 右緣帶寬(= --field-height-md 36;user 2026-09-03 留言由 40 改 36,框比貼邊鈕寬 8px 剛好)。 */
const BAND_PX = 36
/** 拖曳啟動門檻 px(小於視為點擊;dnd-kit PointerSensor activationConstraint.distance 同量級)。 */
const DRAG_THRESHOLD = 8
/** 鍵盤每步 16(同 AgentPanel 調寬步長)。 */
const KEY_STEP = 16
/** 已在區內時再多 16px 才算離開(邊界防抖)。 */
const HYSTERESIS = 16
/**
 * 右緣帶(拖曳中才出現的區域型目標)= 底色 `bg-primary-subtle`、貼邊側無框無圓角、內側圓角 md、不畫線
 * (2026-09-03 user 問「要不要上底色、右邊要不要邊框」→ 四路研究後定):
 * - 底色消費 DS「區域內就是目標」的既有 canonical:lib/drag-visual.ts inside-drop highlight、DataTable 範圍選取
 *   (user 2026-05-10:「range 的 cell 本來就有顏色變化,那樣就夠了,不需要再有 2px 藍色的框」);light 為不透明 blue-1、
 *   dark 由 primitives 公式成 alpha ≈ .19,同一個 token 兩模式,不自創 alpha(color.spec.md 已拒 state-layer 流派)。
 * - 貼邊側不畫線、不留圓角 = Sheet / Sidebar / AppShell 側欄 / 貼邊鈕本身(環只畫露出三邊)的同一語言。
 * - 不用虛線框:DS 內 dashed 是 FileUpload「靜止就可見的常駐拖入區」語彙;拖曳中才出現的停靠區各家一律填色無框
 *   (Windows Snap「translucent overlay」https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241、
 *   macOS「highlighted area」https://support.apple.com/guide/mac-help/tile-app-windows-mchlef287e5d/mac、
 *   Atlassian「droppable area 換底色」https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines、
 *   VS Code editorGroup.dropBackground https://github.com/microsoft/vscode/blob/main/src/vs/workbench/common/theme.ts)。
 */
const SNAP_ZONE_CLASSES = 'bg-primary-subtle rounded-l-md'

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
/**
 * 貼邊鈕合法 y(鈕頂)範圍(user 2026-09-03 留言拍板):最高 = 圓心落在視窗中線(dockMinY);最低 = 鈕底離家頂
 * 一個 loose(dockMaxY = 舞台高 − 2·loose − 40 − 28),永不與家重疊、也不壓到分頁列。矮視窗放不下時整帶收成中線一點。
 */
const dockMinY = (s: Stage) => Math.floor(s.h / 2 - DOCK_PX / 2)
const dockMaxY = (s: Stage) => Math.max(dockMinY(s), s.h - 2 * s.inset - FAB_PX - DOCK_PX)
/**
 * 兩態的殼左上座標(都以 left/top 表達,才能在拖曳、落定之間連續過渡)。殼恆為 40 寬、內容靠右:貼邊時 28 鈕
 * 靠在殼的右緣 = 舞台右緣,形態過渡(40→28)在殼內縮、右緣不動 → 不會有任何一格超出舞台
 * (2026-09-03 實測:以 left = 舞台寬 − 28 定位時,寬度過渡中會凸出右緣 12px,讓文件長出捲軸、舞台變窄)。
 */
const placementXY = (s: Stage, p: AgentFabPlacement): Point =>
  p.kind === 'dock'
    ? { x: s.w - FAB_PX, y: clamp(p.y, dockMinY(s), dockMaxY(s)) }
    : { x: s.w - s.inset - FAB_PX, y: s.h - s.inset - FAB_PX }
const inRect = (p: Point, r: Rect, pad: number) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

/**
 * 磁吸區域表:每列 = 「區域矩形(拖 40 圓鈕時就以底色標出)+ 指標在此區時的落點」。拖曳中的預覽 = 落點本身
 * (帶內所見即所得),放開就落定;指標不在任何區 → 40 圓鈕跟著游標,放開飛回家。判定用**指標**位置
 * (意圖在指尖;Windows Snap 看游標碰邊、Android Bubbles 看拖到關閉區),已在區內時多 16px 遲滯才算離開。
 * 要加磁吸點(鏡像左緣、四角…)只在此表加一列(必要時擴 AgentFabPlacement 的 kind),拖曳 / 預覽 / 底色流程不變
 * (spec「收到邊」節「區域 → 落點表」)。
 */
interface SnapZone {
  rect: (s: Stage) => Rect
  /** 指標在區內時的落點(y = 指標減去抓取偏移,夾在合法範圍)。 */
  placement: (p: Point, grab: Point, s: Stage) => AgentFabPlacement
}
const SNAP_ZONES: readonly SnapZone[] = [
  {
    // 右緣帶:寬 36,上起中線(鈕圓心)、下到貼邊鈕最低的底邊(= 底色範圍 = 合法 y 範圍);落點 = 28 半圓貼右緣、停在指標高度。
    rect: (s) => ({ x: s.w - BAND_PX, y: dockMinY(s), w: BAND_PX, h: Math.max(0, dockMaxY(s) + DOCK_PX - dockMinY(s)) }),
    placement: (p, grab, s) => ({ kind: 'dock', y: clamp(p.y - Math.min(grab.y, DOCK_PX), dockMinY(s), dockMaxY(s)) }),
  },
]
const findZone = (p: Point, s: Stage, active: SnapZone | null): SnapZone | null =>
  active && inRect(p, active.rect(s), HYSTERESIS) ? active : (SNAP_ZONES.find((z) => inRect(p, z.rect(s), 0)) ?? null)

function readPx(el: HTMLElement | null, variable: string, fallback: number) {
  if (!el) return fallback
  const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(variable))
  return Number.isFinite(value) ? value : fallback
}

/** 拖曳中的暫態:左上座標 + 預覽落點(null = 不在任何磁吸區,放開飛回家)+ 從哪一態拖起(決定顯不顯示帶)。 */
interface DragState extends Point {
  placement: AgentFabPlacement | null
  origin: Shape
}

/** 指標拖曳引擎:門檻、磁吸判定、放開落定、Esc 取消、吞掉拖曳後的 click;外殼只負責畫形狀與帶。 */
function useSnapDrag(opts: {
  host: () => HTMLElement | null
  inset: number
  placement: AgentFabPlacement
  commit: (next: AgentFabPlacement) => void
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const dragRef = React.useRef<{ startX: number; startY: number; moved: boolean; zone: SnapZone | null; last: AgentFabPlacement | null } | null>(null)
  const suppressClickRef = React.useRef(false)
  const swallowNextClick = () => {
    // 拖曳放開後瀏覽器可能緊接著發 click(同元素)→ 吞掉;元素若已換態不會有 click → 下一 tick 清旗標。
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const host = opts.host()
    if (!host) return
    const rect = host.getBoundingClientRect()
    const stage: Stage = { w: rect.width, h: rect.height, inset: opts.inset }
    const origin = opts.placement.kind
    const cur = placementXY(stage, opts.placement)
    const grab: Point = { x: e.clientX - rect.left - cur.x, y: e.clientY - rect.top - cur.y }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return
      d.moved = true
      const p: Point = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
      d.zone = findZone(p, stage, d.zone)
      if (d.zone) {
        // 所見即所得:預覽就畫在放開會落的位置(貼右緣、指標高度)。
        d.last = d.zone.placement(p, grab, stage)
        setDrag({ ...placementXY(stage, d.last), placement: d.last, origin })
      } else {
        // 帶外:40 圓鈕跟著游標(夾在舞台內),放開飛回家。
        d.last = null
        setDrag({
          x: clamp(p.x - Math.min(grab.x, FAB_PX), 0, stage.w - FAB_PX),
          y: clamp(p.y - Math.min(grab.y, FAB_PX), 0, stage.h - FAB_PX),
          placement: null,
          origin,
        })
      }
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      dragRef.current = null
      setDrag(null)
    }
    const onUp = () => {
      const d = dragRef.current
      cleanup()
      if (!d?.moved) return
      swallowNextClick()
      opts.commit(d.last ?? AGENT_FAB_HOME)
    }
    // Esc = 取消拖曳、回原位。
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !dragRef.current?.moved) return
      ev.preventDefault()
      swallowNextClick()
      cleanup()
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false, zone: null, last: null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
  }
  const onClickCapture = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }
  return { drag, onPointerDown, onClickCapture }
}

export interface AgentFabDockProps extends Omit<AgentFabProps, 'className' | 'onClick'> {
  /** 受控位置。 */
  placement?: AgentFabPlacement
  /** 非受控初始位置;預設家(右下角)。 */
  defaultPlacement?: AgentFabPlacement
  /** 位置變更(拖放 / 鍵盤 / 選單);consumer 自行決定要不要持久化(DS 不寫 storage)。 */
  onPlacementChange?: (placement: AgentFabPlacement) => void
  /** 點擊(開面板);兩態都一段,拖曳超過門檻的放開不觸發。 */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** 定位殼 className(殼為 absolute,舞台需 relative)。 */
  className?: string
  /** 文案(可覆寫供 i18n)。 */
  labels?: { dock?: string; home?: string; tooltip?: string; tooltipDock?: string }
}

const AgentFabDock = React.forwardRef<HTMLDivElement, AgentFabDockProps>(
  (
    {
      placement: placementProp,
      defaultPlacement = AGENT_FAB_HOME,
      onPlacementChange,
      onClick,
      className,
      labels,
      attention = false,
      'aria-label': ariaLabel,
      ...buttonProps
    },
    ref,
  ) => {
    const reduced = usePrefersReducedMotion()
    const [uncontrolled, setUncontrolled] = React.useState<AgentFabPlacement>(defaultPlacement)
    const placement = placementProp ?? uncontrolled
    const setPlacement = React.useCallback(
      (next: AgentFabPlacement) => {
        if (placementProp === undefined) setUncontrolled(next)
        onPlacementChange?.(next)
      },
      [placementProp, onPlacementChange],
    )
    const shellRef = React.useRef<HTMLDivElement | null>(null)
    React.useImperativeHandle(ref, () => shellRef.current as HTMLDivElement)
    const host = () => (shellRef.current?.offsetParent as HTMLElement | null) ?? null
    // 舞台尺寸(offsetParent;ResizeObserver 跟隨)。
    const [size, setSize] = React.useState({ w: 0, h: 0 })
    React.useLayoutEffect(() => {
      const el = host()
      if (!el) return
      const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])
    // 首次量到舞台前的那一次 render 位置是假的(0×0 舞台);量測時讀 clientWidth 會逼瀏覽器先算完那個假位置,
    // 若此時已掛 transition,首幀會從左上角飛進來 → 第一次真位置畫完(useEffect 在 paint 後)才開放過渡。
    const [ready, setReady] = React.useState(false)
    React.useEffect(() => {
      if (size.w > 0) setReady(true)
    }, [size.w])
    const inset = readPx(shellRef.current, '--layout-space-loose', 16)
    const stage: Stage = { w: size.w, h: size.h, inset }
    const { drag, onPointerDown, onClickCapture } = useSnapDrag({ host, inset, placement, commit: setPlacement })
    const [menuOpen, setMenuOpen] = React.useState(false)

    const shape: Shape = drag ? (drag.placement?.kind ?? 'home') : placement.kind
    const isDock = shape === 'dock'
    const px = isDock ? DOCK_PX : FAB_PX
    const pos: Point = drag ? { x: drag.x, y: drag.y } : placementXY(stage, placement)
    /** 帶只在拖 40 圓鈕時可見(拖小鈕不顯示;user 2026-09-03)。 */
    const showZones = drag?.origin === 'home'

    const text = {
      dock: labels?.dock ?? '縮小按鈕', // i18n-allow: DS 預設文案(2026-09-03 user 拍板;「按鈕」點名對象,不與內容縮放的「縮小」混淆),labels 可覆寫
      home: labels?.home ?? '放大按鈕', // i18n-allow: DS 預設文案(2026-09-03 user 拍板),labels 可覆寫
      tooltip: labels?.tooltip ?? '問我或推走我', // i18n-allow: DS 預設文案(2026-09-03 user 原話,原「問我或是推我到旁邊」改短),labels 可覆寫
      tooltipDock: labels?.tooltipDock ?? '開啟智慧代理', // i18n-allow: DS 預設文案(小鈕只寫開啟;= aria-label),labels 可覆寫
    }
    const buttonLabel = ariaLabel ?? '開啟智慧代理' // i18n-allow: DS 預設文案,aria-label prop 可覆寫

    /** 鍵盤:家 → 貼邊(停在帶底);貼邊 ↑↓ 16px、← / Home 回家;Shift+F10 開選單。 */
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault()
        setMenuOpen(true)
        return
      }
      if (placement.kind === 'home') {
        if (e.key !== 'ArrowRight') return
        e.preventDefault()
        setPlacement({ kind: 'dock', y: dockMaxY(stage) })
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'Home') {
        e.preventDefault()
        setPlacement(AGENT_FAB_HOME)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const dy = e.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP
        setPlacement({ kind: 'dock', y: clamp(placement.y + dy, dockMinY(stage), dockMaxY(stage)) })
      }
    }

    const dragging = drag !== null
    return (
      <>
        {/* 磁吸區底色:矩形直接來自區域表(邏輯與視覺同一份);淡入淡出 150ms、減動作直接落定;不攔指標。 */}
        {SNAP_ZONES.map((zone, i) => {
          const r = zone.rect(stage)
          return (
            <div
              key={i}
              aria-hidden
              data-agent-fab-zone=""
              className={cn(
                'pointer-events-none absolute z-10',
                SNAP_ZONE_CLASSES,
                'transition-opacity duration-[var(--motion-duration-overlay)] motion-reduce:transition-none',
                showZones ? 'opacity-100' : 'opacity-0',
              )}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            />
          )
        })}
        <div
          ref={shellRef}
          data-placement={placement.kind}
          data-shape={shape}
          data-dragging={dragging ? '' : undefined}
          data-snapped={drag?.placement ? '' : undefined}
          className={cn(
            'group/dock absolute z-20 flex w-10 justify-end',
            // 落點修正 / 飛回家 250ms + enter;拖曳中跟指標不過渡。
            ready && !dragging && !reduced && 'transition-[left,top] duration-[var(--motion-duration-surface)] ease-[var(--motion-easing-enter)]',
            dragging ? 'cursor-grabbing select-none' : 'cursor-grab',
            className,
          )}
          // 舞台尺寸量到前先隱藏(否則首影格會以 0×0 舞台算成左上角再跳到右下角)。
          style={{ left: pos.x, top: pos.y, visibility: stage.w > 0 ? undefined : 'hidden' }}
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
            {/* 選單只由右鍵 / Shift+F10 開;錨點 = 蓋住鈕的透明 span(pointer-events-none,不攔點擊)。 */}
            <DropdownMenuTrigger asChild>
              <span aria-hidden className="pointer-events-none absolute inset-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {placement.kind === 'home' ? (
                <DropdownMenuItem startIcon={ArrowRightToLine} onSelect={() => setPlacement({ kind: 'dock', y: dockMaxY(stage) })}>{text.dock}</DropdownMenuItem>
              ) : (
                <DropdownMenuItem startIcon={ArrowLeftFromLine} onSelect={() => setPlacement(AGENT_FAB_HOME)}>{text.home}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip open={dragging ? false : undefined}>
            <TooltipTrigger asChild>
              {/* 單一殼:寬高與圓角在兩態間過渡 150ms,拖曳中當場變形 = 所見即所得。 */}
              <span
                className={cn(
                  'inline-flex p-[2px] shadow-[var(--elevation-200)]',
                  'transition-[width,height,border-radius,box-shadow] duration-[var(--motion-duration-overlay)] ease-[var(--motion-easing-enter)] motion-reduce:transition-none',
                  isDock ? 'rounded-l-full pr-0' : 'rounded-full',
                  !dragging && 'hover:shadow-[var(--elevation-200-hover)]',
                )}
                style={{ background: RING_GRADIENT, width: px, height: px }}
              >
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-full w-full cursor-[inherit] items-center justify-center border-none bg-surface-raised',
                    isDock ? 'rounded-l-full' : 'rounded-full',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                  aria-label={buttonLabel}
                  onPointerDown={onPointerDown}
                  onKeyDown={onKeyDown}
                  onClickCapture={onClickCapture}
                  onClick={onClick}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuOpen(true)
                  }}
                  {...buttonProps}
                >
                  <AgentLogo state={attention ? 'attract' : 'still'} ripple={false} size={isDock ? 16 : 24} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side={isDock ? 'left' : 'top'}>{isDock ? text.tooltipDock : text.tooltip}</TooltipContent>
          </Tooltip>
        </div>
      </>
    )
  },
)
AgentFabDock.displayName = 'AgentFabDock'

export { AgentFab, AgentFabDock }
