/**
 * AgentFab — 智慧代理浮動開關鈕(AgentPanel 家族附屬資產)+ AgentFabDock(可拖到邊收起的定位殼)。
 *
 * ── 消費的 SSOT ──
 * - 40 圓 = --field-height-lg 於 lg 密度(uiSize.spec.md「lg 密度」表);圓形 iconOnly。
 * - 面 = bg-surface-raised + --elevation-200(elevation.spec.md 配對規則;不寫死白色)。
 * - 外框 = AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱;
 *   spec「FAB」節)。配色兩極 = AgentLogo AGENT_BRAND(= 自家色階 blue-4 / purple-4;
 *   單一數值來源在 agent-logo.tsx,本檔只 import)。
 * - 內置 24 標誌;收起態內置 16 標誌(同一造型,無簡化檔)。
 * - 動畫:待機=靜止;有新訊=招喚態(標誌本體蓄勢,漣漪由邊框光圈代位:0–35% 貼邊聚亮 →
 *   35% 呼氣起點自邊框射出 r 21→27、寬 2.5、.35→0 → 90% 散盡 → 靜止空拍;與標誌同 dur /
 *   同 keyTimes / 同 swell→settle,同一 commit 掛載 → 同相);懸停=陰影升一級+微放大。
 * - 收到邊(AgentFabDock;2026-09-03 user 拍板第三輪:拖曳 + 所見即所得):主鈕可在舞台內**任意拖動**
 *   (Copilot DAB「drag the button」/ Android Bubbles);指標進入右緣 40px 帶 = 收合區,拖曳中的鈕**當場變成**
 *   28 貼邊半圓形(Windows Snap「拖到邊時 Snap 框當場出現」的所見即所得),放開就吸到右緣、停在放開的高度;
 *   離開收合區則變回 40 圓鈕,放開就停在放開處(夾在舞台 loose 內距內)。左緣無收合區(往左丟不會收)。
 *   兩種形態點一下都直接開面板;< 8px 位移視為點擊。鍵盤 ←→↑↓ 16px 移動(→ 到底 = 收合、收合時 ← = 展開);
 *   Home = 放回右下角;右鍵 / Shift+F10 選單「收到右邊 / 放回右下角」。Tooltip「我是 AI,可以任意移動我」。
 *   形態切換 --motion-duration-overlay、落點吸附 --motion-duration-surface + enter;減動作直接落定。
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
 * AgentFabDock — 可任意拖動 + 拖到右緣收合(所見即所得)的定位殼(spec「AgentFab」節「收到邊」)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 位置(相對舞台左上,px):float = 40 圓鈕,x/y 省略 = 右下角(離邊 loose);dock = 28 半圓鈕貼右緣,只記 y。
 * 單一物件避免形態與座標脫鉤。
 */
export type AgentFabPlacement = { kind: 'float'; x?: number; y?: number } | { kind: 'dock'; y: number }

/** 預設位置:右下角展開。 */
export const AGENT_FAB_HOME: AgentFabPlacement = { kind: 'float' }

/** 主鈕直徑(= --field-height-lg 於 lg 密度 40)。 */
const FAB_PX = 40
/** 收合鈕高 / 露出寬(= --field-height-sm 28)。 */
const DOCK_PX = 28
/** 拖曳啟動門檻 px(小於視為點擊;dnd-kit PointerSensor activationConstraint.distance 同量級)。 */
const DRAG_THRESHOLD = 8
/** 收合區:指標距右緣 ≤ 40(= 主鈕直徑)進入、≥ 56 離開(16 遲滯,避免邊界抖動)。 */
const DOCK_ZONE_ENTER = FAB_PX
const DOCK_ZONE_LEAVE = FAB_PX + 16
/** 鍵盤每步 16(同 AgentPanel 調寬步長)。 */
const KEY_STEP = 16

export interface AgentFabDockProps extends Omit<AgentFabProps, 'className' | 'onClick'> {
  /** 受控位置。 */
  placement?: AgentFabPlacement
  /** 非受控初始位置;預設右下角。 */
  defaultPlacement?: AgentFabPlacement
  /** 位置變更(拖放 / 鍵盤 / 選單);consumer 自行決定要不要持久化(DS 不寫 storage)。 */
  onPlacementChange?: (placement: AgentFabPlacement) => void
  /** 點擊(開面板);兩種形態都一段,拖曳超過門檻的放開不觸發。 */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** 定位殼 className(殼為 absolute,舞台需 relative)。 */
  className?: string
  /** 文案(可覆寫供 i18n)。 */
  labels?: { dock?: string; home?: string; tooltip?: string }
}

function readPx(el: HTMLElement | null, variable: string, fallback: number) {
  if (!el) return fallback
  const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(variable))
  return Number.isFinite(value) ? value : fallback
}
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

type Shape = 'float' | 'dock'

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
    // 舞台尺寸(offsetParent;ResizeObserver 跟隨),座標一律以 left/top 表達才能在拖曳、吸附之間連續過渡。
    const [stage, setStage] = React.useState({ w: 0, h: 0 })
    React.useLayoutEffect(() => {
      const host = shellRef.current?.offsetParent as HTMLElement | null
      if (!host) return
      const update = () => setStage({ w: host.clientWidth, h: host.clientHeight })
      update()
      const ro = new ResizeObserver(update)
      ro.observe(host)
      return () => ro.disconnect()
    }, [])
    const inset = readPx(shellRef.current, '--layout-space-loose', 16)

    const [drag, setDrag] = React.useState<{ x: number; y: number; shape: Shape } | null>(null)
    const dragRef = React.useRef<{ startX: number; startY: number; offX: number; offY: number; moved: boolean; shape: Shape; cleanup: () => void } | null>(null)
    const suppressClickRef = React.useRef(false)
    const [menuOpen, setMenuOpen] = React.useState(false)

    const shape: Shape = drag ? drag.shape : placement.kind
    const size = shape === 'dock' ? DOCK_PX : FAB_PX
    const maxX = stage.w - inset - FAB_PX
    const maxY = (s: Shape) => stage.h - inset - (s === 'dock' ? DOCK_PX : FAB_PX)

    /** 目前應顯示的左上座標(未拖曳)。 */
    const resting = (): { x: number; y: number } => {
      if (placement.kind === 'dock') return { x: stage.w - DOCK_PX, y: clamp(placement.y, inset, maxY('dock')) }
      const x = placement.x ?? maxX
      const y = placement.y ?? maxY('float')
      return { x: clamp(x, inset, maxX), y: clamp(y, inset, maxY('float')) }
    }
    const pos = drag ? { x: drag.x, y: drag.y } : resting()

    const text = {
      dock: labels?.dock ?? '收到右邊', // i18n-allow: DS 預設文案,labels 可覆寫
      home: labels?.home ?? '放回右下角', // i18n-allow: DS 預設文案,labels 可覆寫
      tooltip: labels?.tooltip ?? '我是 AI,可以任意移動我', // i18n-allow: DS 預設文案(2026-09-03 user 原話),labels 可覆寫
    }
    const buttonLabel = ariaLabel ?? '開啟智慧代理' // i18n-allow: DS 預設文案,aria-label prop 可覆寫

    /** 放開:收合區 → 貼右緣、停在放開高度;否則 → 停在放開處。 */
    const settle = (x: number, y: number, s: Shape) => {
      if (s === 'dock') setPlacement({ kind: 'dock', y: clamp(y, inset, maxY('dock')) })
      else setPlacement({ kind: 'float', x: clamp(x, inset, maxX), y: clamp(y, inset, maxY('float')) })
    }

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      const host = shellRef.current?.offsetParent as HTMLElement | null
      if (!host) return
      const rect = host.getBoundingClientRect()
      const cur = resting()
      const start = { startX: e.clientX, startY: e.clientY, offX: e.clientX - rect.left - cur.x, offY: e.clientY - rect.top - cur.y, moved: false, shape: placement.kind as Shape, cleanup: () => {} }
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return
        d.moved = true
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top
        // 所見即所得:指標進收合區 → 拖曳中的鈕當場變 28 半圓;離開 → 變回 40 圓(16px 遲滯防抖)。
        const distRight = rect.width - px
        if (d.shape === 'float' && distRight <= DOCK_ZONE_ENTER) d.shape = 'dock'
        else if (d.shape === 'dock' && distRight >= DOCK_ZONE_LEAVE) d.shape = 'float'
        const s = d.shape
        const sz = s === 'dock' ? DOCK_PX : FAB_PX
        // 跟指標:形態變小時以指標為中心重新對齊,避免鈕從指標下面跑掉。
        const x = s === 'dock' ? rect.width - DOCK_PX : px - Math.min(d.offX, sz)
        const y = py - Math.min(d.offY, sz)
        setDrag({ x, y, shape: s })
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('keydown', onKey)
        dragRef.current = null
        setDrag(null)
      }
      const onUp = (ev: PointerEvent) => {
        const d = dragRef.current
        cleanup()
        if (!d?.moved) return
        // 拖曳放開後瀏覽器可能緊接著發 click(同元素)→ 吞掉;元素若已換態不會有 click → 下一 tick 清旗標。
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top
        const sz = d.shape === 'dock' ? DOCK_PX : FAB_PX
        settle(px - Math.min(d.offX, sz), py - Math.min(d.offY, sz), d.shape)
      }
      // Esc = 取消拖曳、回原位。
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && dragRef.current?.moved) {
          ev.preventDefault()
          suppressClickRef.current = true
          window.setTimeout(() => {
            suppressClickRef.current = false
          }, 0)
          cleanup()
        }
      }
      start.cleanup = cleanup
      dragRef.current = start
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
    }
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        e.preventDefault()
        return
      }
      onClick?.(e)
    }

    /** 鍵盤:←→↑↓ 16px;→ 到右緣 = 收合;收合時 ← = 展開到 loose 內距;Home = 放回右下角;Shift+F10 開選單。 */
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault()
        setMenuOpen(true)
        return
      }
      const cur = resting()
      if (e.key === 'Home') {
        e.preventDefault()
        setPlacement(AGENT_FAB_HOME)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (placement.kind === 'dock') return
        if (cur.x >= maxX) setPlacement({ kind: 'dock', y: clamp(cur.y, inset, maxY('dock')) })
        else setPlacement({ kind: 'float', x: Math.min(cur.x + KEY_STEP, maxX), y: cur.y })
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (placement.kind === 'dock') setPlacement({ kind: 'float', x: maxX, y: clamp(cur.y, inset, maxY('float')) })
        else setPlacement({ kind: 'float', x: Math.max(cur.x - KEY_STEP, inset), y: cur.y })
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const dy = e.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP
        if (placement.kind === 'dock') setPlacement({ kind: 'dock', y: clamp(cur.y + dy, inset, maxY('dock')) })
        else setPlacement({ kind: 'float', x: cur.x, y: clamp(cur.y + dy, inset, maxY('float')) })
      }
    }

    const shared = {
      onPointerDown,
      onKeyDown,
      onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        setMenuOpen(true)
      },
      onClick: handleClick,
      'aria-label': buttonLabel,
      ...buttonProps,
    }
    const dragging = drag !== null
    const isDock = shape === 'dock'

    return (
      <div
        ref={shellRef}
        data-placement={placement.kind}
        data-shape={shape}
        data-dragging={dragging ? '' : undefined}
        className={cn(
          'group/dock absolute z-20 inline-flex',
          !dragging && !reduced && 'transition-[left,top] duration-[var(--motion-duration-surface)] ease-[var(--motion-easing-enter)]',
          dragging ? 'cursor-grabbing select-none' : 'cursor-grab',
          className,
        )}
        style={{ left: pos.x, top: pos.y }}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          {/* 選單只由右鍵 / Shift+F10 開;錨點 = 蓋住鈕的透明 span(pointer-events-none,不攔點擊)。 */}
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {placement.kind === 'float' && (
              <DropdownMenuItem onSelect={() => setPlacement({ kind: 'dock', y: clamp(resting().y, inset, maxY('dock')) })}>{text.dock}</DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setPlacement(AGENT_FAB_HOME)}>{text.home}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip open={dragging ? false : undefined}>
          <TooltipTrigger asChild>
            {/* 單一殼:寬高與圓角在兩形態間過渡(--motion-duration-overlay),拖曳中當場變形 = 所見即所得。 */}
            <span
              className={cn(
                'inline-flex p-[2px] shadow-[var(--elevation-200)]',
                'transition-[width,height,border-radius,box-shadow] duration-[var(--motion-duration-overlay)] ease-[var(--motion-easing-enter)] motion-reduce:transition-none',
                isDock ? 'rounded-l-full pr-0' : 'rounded-full',
                !dragging && 'hover:shadow-[var(--elevation-200-hover)]',
              )}
              style={{ background: RING_GRADIENT, width: size, height: size }}
            >
              <button
                type="button"
                className={cn(
                  'inline-flex h-full w-full cursor-[inherit] items-center justify-center border-none bg-surface-raised',
                  isDock ? 'rounded-l-full' : 'rounded-full',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
                {...shared}
              >
                <AgentLogo state={attention ? 'attract' : 'still'} ripple={false} size={isDock ? 16 : 24} />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side={isDock ? 'left' : 'top'}>{text.tooltip}</TooltipContent>
        </Tooltip>
      </div>
    )
  },
)
AgentFabDock.displayName = 'AgentFabDock'

export { AgentFab, AgentFabDock }

