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
 * - 收到邊(AgentFabDock,2026-09-02 user 拍板第二輪:Teambition 專案頁實測同構、去拖曳):只有兩個位置——
 *   展開 = 右下角 40 圓鈕(離邊 loose);收起 = Button sm 尺寸(--field-height-sm 28)貼右緣半圓鈕(只留內側
 *   圓角)+ 16 標誌,同一高度、只沿 x 平移(--motion-duration-surface + enter;減動作直接落定)。
 *   **兩個位置都一段點開面板**。滑鼠停在鈕群或鍵盤焦點在鈕群時淡入一顆「收合/展開」小鈕
 *   (視覺 18 = 行內動作 hover 底盤階 INLINE_ACTION_HOVER_BG_SIZE.md、命中區 24 = WCAG 2.5.8 最小目標;
 *   圖示 chevrons-right / chevrons-left = Lucide panel-close/open 方向配對;展開時與 40 圓右上角相切、
 *   收起時與半圓左上角相切,兩者都貼著主鈕、中間無縫 = WCAG 1.4.13 hoverable);觸控暫不處理,
 *   右鍵 / Shift+F10 選單與鍵盤 ←→ 為等價路徑。位置由 consumer 受控/非受控,DS 不寫 storage。
 * - 減動作:光圈屬常駐位移 loop → prefers-reduced-motion 全停(標誌內部自回靜止)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { INLINE_ACTION_HOVER_BG_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'
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
 * AgentFabDock — 兩位置定位殼(展開 / 收到右緣)+ hover 收合小鈕(spec「AgentFab」節「收到邊」)
 * ──────────────────────────────────────────────────────────────────────── */

/** 位置:float = 舞台右下角(離邊 loose);collapsed = 同一高度貼右緣的 28 半圓鈕。 */
export type AgentFabPlacement = 'float' | 'collapsed'

/** 主鈕直徑(= --field-height-lg 於 lg 密度 40)。 */
const FAB_PX = 40
/** 收起鈕高(= --field-height-sm 28)。 */
const COLLAPSED_PX = 28
/** 小鈕視覺直徑 = 行內動作 md 的 hover 底盤階(18);命中區 24 = WCAG 2.5.8 最小目標。 */
const TOGGLE_VISUAL_PX = INLINE_ACTION_HOVER_BG_SIZE.md
const TOGGLE_HIT_PX = 24
const SIN45 = Math.SQRT1_2

export interface AgentFabDockProps extends Omit<AgentFabProps, 'className' | 'onClick'> {
  /** 受控位置。 */
  placement?: AgentFabPlacement
  /** 非受控初始位置;預設右下角展開。 */
  defaultPlacement?: AgentFabPlacement
  /** 位置變更(小鈕 / 選單 / 鍵盤);consumer 自行決定要不要持久化(DS 不寫 storage)。 */
  onPlacementChange?: (placement: AgentFabPlacement) => void
  /** 點擊(開面板);兩個位置都一段開啟。 */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** 定位殼 className(殼為 absolute,舞台需 relative)。 */
  className?: string
  /** 文案(可覆寫供 i18n)。 */
  labels?: { collapse?: string; expand?: string }
}

const AgentFabDock = React.forwardRef<HTMLDivElement, AgentFabDockProps>(
  (
    {
      placement: placementProp,
      defaultPlacement = 'float',
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
    const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
    const fabId = `${uid}fab`
    const [uncontrolled, setUncontrolled] = React.useState<AgentFabPlacement>(defaultPlacement)
    const placement = placementProp ?? uncontrolled
    const collapsed = placement === 'collapsed'
    const setPlacement = (next: AgentFabPlacement) => {
      if (placementProp === undefined) setUncontrolled(next)
      onPlacementChange?.(next)
    }
    const toggle = () => setPlacement(collapsed ? 'float' : 'collapsed')
    const [menuOpen, setMenuOpen] = React.useState(false)
    const text = {
      collapse: labels?.collapse ?? '收到右邊', // i18n-allow: DS 預設文案,labels 可覆寫
      expand: labels?.expand ?? '放回右下角', // i18n-allow: DS 預設文案,labels 可覆寫
    }
    const buttonLabel = ariaLabel ?? '開啟智慧代理' // i18n-allow: DS 預設文案,aria-label prop 可覆寫

    /** 鍵盤:→ 收到右邊、← 放回右下角(與小鈕/選單等價);Shift+F10 開選單。 */
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault()
        setMenuOpen(true)
      } else if (e.key === 'ArrowRight' && !collapsed) {
        e.preventDefault()
        setPlacement('collapsed')
      } else if (e.key === 'ArrowLeft' && collapsed) {
        e.preventDefault()
        setPlacement('float')
      }
    }
    const shared = {
      id: fabId,
      onKeyDown,
      onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        setMenuOpen(true)
      },
      onClick,
      'aria-label': buttonLabel,
      ...buttonProps,
    }

    // 小鈕圓心:展開 = 40 圓右上 45° 切點外側;收起 = 半圓左上 45° 切點外側(往舞台內側,不出畫面)。
    const r = collapsed ? COLLAPSED_PX / 2 : FAB_PX / 2
    const t = TOGGLE_VISUAL_PX / 2
    const cx = collapsed ? r - (r + t) * SIN45 : r + (r + t) * SIN45
    const cy = r - (r + t) * SIN45
    const toggleStyle: React.CSSProperties = {
      width: TOGGLE_HIT_PX,
      height: TOGGLE_HIT_PX,
      left: cx - TOGGLE_HIT_PX / 2,
      top: cy - TOGGLE_HIT_PX / 2,
    }
    const ToggleIcon = collapsed ? ChevronsLeft : ChevronsRight

    return (
      <div
        ref={ref}
        data-placement={placement}
        className={cn(
          'group/dock absolute z-20 inline-flex',
          !reduced && 'transition-[inset-inline-end] duration-[var(--motion-duration-surface)] ease-[var(--motion-easing-enter)]',
          className,
        )}
        style={{ bottom: 'var(--layout-space-loose)', insetInlineEnd: collapsed ? 0 : 'var(--layout-space-loose)' }}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          {/* 選單只由右鍵 / Shift+F10 開;錨點 = 蓋住鈕的透明 span(pointer-events-none,不攔點擊)。 */}
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={toggle}>{collapsed ? text.expand : text.collapse}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {collapsed ? (
          // 收起態:sm 尺寸貼邊半圓鈕,環只畫露出的三邊,內置 16 標誌;有新訊同款蓄勢、光圈省略(貼邊會被裁)。
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex h-field-sm w-[var(--field-height-sm)] rounded-l-full p-[2px] pr-0 shadow-[var(--elevation-200)] transition-shadow duration-[var(--motion-duration-overlay)] hover:shadow-[var(--elevation-200-hover)]"
                style={{ background: RING_GRADIENT }}
              >
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-full w-full cursor-pointer items-center justify-center rounded-l-full border-none bg-surface-raised',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                  {...shared}
                >
                  <AgentLogo state={attention ? 'attract' : 'still'} ripple={false} size={16} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">{buttonLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <AgentFab attention={attention} {...shared} />
        )}
        {/* 收合 / 展開小鈕:hover 鈕群或鍵盤焦點在鈕群時淡入(Polaris / Carbon / Atlassian「hover 與 focus 都顯示」);
            視覺 18 圓盤 + 24 命中區;與主鈕 45° 相切、無縫。Tab 順序:主鈕 → 小鈕。 */}
        <button
          type="button"
          aria-label={collapsed ? text.expand : text.collapse}
          aria-expanded={!collapsed}
          aria-controls={fabId}
          onClick={toggle}
          className={cn(
            'absolute grid place-items-center rounded-full cursor-pointer',
            'opacity-0 transition-opacity duration-[var(--motion-duration-overlay)] motion-reduce:transition-none',
            'group-hover/dock:opacity-100 group-focus-within/dock:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
          style={toggleStyle}
        >
          <span
            aria-hidden
            className="grid place-items-center rounded-full border border-border bg-surface-raised text-fg-muted shadow-[var(--elevation-100)]"
            style={{ width: TOGGLE_VISUAL_PX, height: TOGGLE_VISUAL_PX }}
          >
            <ToggleIcon size={ICON_SIZE.md} />
          </span>
        </button>
      </div>
    )
  },
)
AgentFabDock.displayName = 'AgentFabDock'

export { AgentFab, AgentFabDock }

