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
 * - 收到邊(AgentFabDock,2026-09-02 user 拍板方案 C):只貼左右兩緣、放開吸到最近邊並保留 y、
 *   收起態 = Button sm 尺寸(--field-height-sm 28/32)貼邊半圓鈕(只留內側圓角)+ 16 標誌;
 *   點=開面板、拖回舞台中段=回右下角;鍵盤 ↑↓ 16px / ←→ 換邊、右鍵或 Shift+F10 開選單;
 *   吸邊位移 --motion-duration-surface + --motion-easing-enter;prefers-reduced-motion 直接落定。
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
 * AgentFabDock — 可拖到邊收起的定位殼(方案 C;spec「AgentFab」節「收到邊」)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * 位置:float = 舞台右下角(內距 loose,offset 忽略);start / end = 貼左 / 右緣,
 * offset = 鈕頂距舞台頂的 px(渲染時夾在 loose ~ 舞台高 − 鈕高 − loose)。單一物件避免 side 與 y 脫鉤。
 */
export interface AgentFabPlacement {
  side: 'float' | 'start' | 'end'
  offset: number
}

export const AGENT_FAB_FLOAT: AgentFabPlacement = { side: 'float', offset: 0 }

/** 拖曳啟動門檻 px(小於視為點擊;dnd-kit PointerSensor activationConstraint.distance 同量級)。 */
const DRAG_THRESHOLD = 8
/** 鍵盤每步 16(同 AgentPanel 調寬步長)。 */
const DOCK_KEY_STEP = 16

export interface AgentFabDockProps extends Omit<AgentFabProps, 'className' | 'onClick'> {
  /** 受控位置。 */
  placement?: AgentFabPlacement
  /** 非受控初始位置;預設右下角。 */
  defaultPlacement?: AgentFabPlacement
  /** 位置變更(拖放吸邊 / 鍵盤 / 選單);consumer 自行決定要不要持久化(DS 不寫 storage)。 */
  onPlacementChange?: (placement: AgentFabPlacement) => void
  /** 可拖(預設 true);false 時只有鍵盤與選單。 */
  draggable?: boolean
  /** 點擊(開面板);拖曳超過門檻的放開不觸發。 */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** 定位殼 className(殼為 absolute,舞台需 relative)。 */
  className?: string
  /** 選單文案(可覆寫供 i18n)。 */
  menuLabels?: { dockEnd?: string; dockStart?: string; float?: string }
}

function clampOffset(offset: number, stage: HTMLElement | null, size: number, inset: number) {
  if (!stage) return Math.max(inset, offset)
  const max = Math.max(inset, stage.clientHeight - size - inset)
  return Math.min(Math.max(inset, offset), max)
}

function readPx(el: HTMLElement | null, variable: string, fallback: number) {
  if (!el) return fallback
  const value = Number.parseFloat(getComputedStyle(el).getPropertyValue(variable))
  return Number.isFinite(value) ? value : fallback
}

const AgentFabDock = React.forwardRef<HTMLDivElement, AgentFabDockProps>(
  (
    {
      placement: placementProp,
      defaultPlacement = AGENT_FAB_FLOAT,
      onPlacementChange,
      draggable = true,
      onClick,
      className,
      menuLabels,
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
    const dragRef = React.useRef<{ startX: number; startY: number; moved: boolean } | null>(null)
    const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null)
    const suppressClickRef = React.useRef(false)
    const [menuOpen, setMenuOpen] = React.useState(false)
    const docked = placement.side !== 'float'
    const stage = () => shellRef.current?.offsetParent as HTMLElement | null

    const inset = readPx(shellRef.current, '--layout-space-loose', 16)
    const dockSize = readPx(shellRef.current, '--field-height-sm', 28)
    const fabSize = 40

    /** 放開:舞台左右各 1/3 內 → 吸到該邊、保留 y;中段 → 回右下角。 */
    const settle = (x: number, y: number) => {
      const host = stage()
      if (!host) return
      const width = host.clientWidth
      if (x < width / 3) setPlacement({ side: 'start', offset: clampOffset(y - dockSize / 2, host, dockSize, inset) })
      else if (x > (width * 2) / 3) setPlacement({ side: 'end', offset: clampOffset(y - dockSize / 2, host, dockSize, inset) })
      else setPlacement(AGENT_FAB_FLOAT)
    }

    const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!draggable || e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false }
      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < DRAG_THRESHOLD) return
        drag.moved = true
        const rect = stage()?.getBoundingClientRect()
        if (rect) setDragPos({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })
      }
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const drag = dragRef.current
        dragRef.current = null
        setDragPos(null)
        if (!drag?.moved) return
        // 拖曳放開後瀏覽器可能緊接著發 click(同元素)→ 吞掉;元素若已換態不會有 click → 下一 tick 清旗標,
        // 避免吞到之後真正的點擊。
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
        const rect = stage()?.getBoundingClientRect()
        if (rect) settle(ev.clientX - rect.left, ev.clientY - rect.top)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        e.preventDefault()
        return
      }
      onClick?.(e)
    }

    /** 鍵盤:←→ 換邊(貼邊時往反方向 = 回右下角);貼邊時 ↑↓ 16px;Shift+F10 開選單。 */
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const host = stage()
      const size = docked ? dockSize : fabSize
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault()
        setMenuOpen(true)
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const target = e.key === 'ArrowLeft' ? 'start' : 'end'
        if (placement.side === target) return
        if (docked) setPlacement(AGENT_FAB_FLOAT)
        else {
          const top = host ? host.clientHeight - size - inset : inset
          setPlacement({ side: target, offset: clampOffset(top, host, dockSize, inset) })
        }
        return
      }
      if (docked && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const delta = e.key === 'ArrowUp' ? -DOCK_KEY_STEP : DOCK_KEY_STEP
        setPlacement({ side: placement.side, offset: clampOffset(placement.offset + delta, host, dockSize, inset) })
      }
    }

    const labels = {
      dockEnd: menuLabels?.dockEnd ?? '收到右邊', // i18n-allow: DS 預設文案,menuLabels 可覆寫
      dockStart: menuLabels?.dockStart ?? '收到左邊', // i18n-allow: DS 預設文案,menuLabels 可覆寫
      float: menuLabels?.float ?? '放回右下角', // i18n-allow: DS 預設文案,menuLabels 可覆寫
    }
    const dockTo = (side: 'start' | 'end') => {
      const host = stage()
      const current = docked ? placement.offset : host ? host.clientHeight - dockSize - inset : inset
      setPlacement({ side, offset: clampOffset(current, host, dockSize, inset) })
    }

    // 定位:拖曳中跟指標;float 右下角;docked 貼邊 + offset(夾限於渲染時)。
    const style: React.CSSProperties = dragPos
      ? { left: dragPos.x - (docked ? dockSize : fabSize) / 2, top: dragPos.y - (docked ? dockSize : fabSize) / 2 }
      : docked
        ? { top: clampOffset(placement.offset, stage(), dockSize, inset), [placement.side === 'end' ? 'insetInlineEnd' : 'insetInlineStart']: 0 }
        : { bottom: 'var(--layout-space-loose)', insetInlineEnd: 'var(--layout-space-loose)' }

    const shared = {
      onPointerDown,
      onKeyDown,
      onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        setMenuOpen(true)
      },
      onClick: handleClick,
      'aria-label': ariaLabel ?? '開啟智慧代理', // i18n-allow: DS 預設文案,aria-label prop 可覆寫
      ...buttonProps,
    }

    return (
      <div
        ref={shellRef}
        data-placement={placement.side}
        data-dragging={dragPos ? '' : undefined}
        className={cn(
          'absolute z-20',
          !dragPos && !reduced &&
            'transition-[top,bottom,inset-inline-start,inset-inline-end] duration-[var(--motion-duration-surface)] ease-[var(--motion-easing-enter)]',
          dragPos && 'cursor-grabbing select-none',
          className,
        )}
        style={style}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          {/* 選單只由右鍵 / Shift+F10 開;錨點 = 蓋住鈕的透明 span(pointer-events-none,不攔點擊)。 */}
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align={placement.side === 'start' ? 'start' : 'end'}>
            {placement.side !== 'end' && <DropdownMenuItem onSelect={() => dockTo('end')}>{labels.dockEnd}</DropdownMenuItem>}
            {placement.side !== 'start' && <DropdownMenuItem onSelect={() => dockTo('start')}>{labels.dockStart}</DropdownMenuItem>}
            {docked && <DropdownMenuItem onSelect={() => setPlacement(AGENT_FAB_FLOAT)}>{labels.float}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        {docked ? (
          // 收起態:sm 尺寸貼邊半圓鈕,環只畫露出的三邊,內置 16 標誌;招喚態同款蓄勢、光圈省略(貼邊會被裁)。
          <span
            className={cn(
              'inline-flex h-field-sm w-[var(--field-height-sm)] p-[2px] shadow-[var(--elevation-200)]',
              placement.side === 'end' ? 'rounded-l-full pr-0' : 'rounded-r-full pl-0',
            )}
            style={{ background: RING_GRADIENT }}
          >
            <button
              type="button"
              className={cn(
                'inline-flex h-full w-full cursor-pointer items-center justify-center border-none bg-surface-raised',
                placement.side === 'end' ? 'rounded-l-full' : 'rounded-r-full',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
              {...shared}
            >
              <AgentLogo state={attention ? 'attract' : 'still'} ripple={false} size={16} />
            </button>
          </span>
        ) : (
          <AgentFab attention={attention} className={dragPos ? 'cursor-grabbing' : undefined} {...shared} />
        )}
      </div>
    )
  },
)
AgentFabDock.displayName = 'AgentFabDock'

export { AgentFab, AgentFabDock }
