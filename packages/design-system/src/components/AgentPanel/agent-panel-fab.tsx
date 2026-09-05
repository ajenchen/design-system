/**
 * AgentFab — 智慧代理浮動開關鈕(AgentPanel 家族附屬資產)+ AgentFabDock(「家 ↔ 貼邊」兩態定位殼)。
 *
 * ── 消費的 SSOT ──
 * - 40 圓 = --field-height-lg 於 lg 密度(uiSize.spec.md「lg 密度」表);圓形 iconOnly。
 * - 面 = bg-surface-raised + --elevation-200(elevation.spec.md 配對規則;不寫死白色)。
 * - 外框 = AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱;
 *   spec「FAB」節)。配色兩極 = AgentLogo AGENT_BRAND(= 自家色階 blue-4 / purple-4;
 *   單一數值來源在 agent-panel-logo.tsx,本檔只 import)。
 * - 內置 24 標誌;貼邊態內置 16 標誌(同一造型,無簡化檔)。
 * - **標誌狀態跟著面板裡的代理走**(prop `logoState`,與 AgentPanelHeader 同名;2026-09-03 user 拍板):入口鈕 = 那個對話收起來的樣子,
 *   所以代理在思考時、即使面板關著,入口鈕的標誌也在轉;有新訊 = 招喚態(標誌蓄勢 + 邊框光圈);閒置 = 靜止。
 *   兩種形態(40 圓 / 28 貼邊)都跟。
 * - 動畫:待機=靜止;有新訊=招喚態(標誌本體蓄勢,漣漪由邊框光圈代位:0–35% 貼邊聚亮 →
 *   35% 呼氣起點自邊框射出 r 21→27、寬 2.5、.35→0 → 90% 散盡 → 靜止空拍;與標誌同 dur /
 *   同 keyTimes / 同 swell→settle,同一 commit 掛載 → 同相);懸停=陰影升一級+微放大。
 * - 兩態定位(AgentFabDock;2026-09-03 user 拍板,取代早期的自由座標與 hover 小鈕):只有兩種合法位置 ——
 *   「家」= 40 圓鈕,位置唯一在右下角(離右、下各 loose);「貼邊」= 28 半圓貼右緣,只有 y 可變(右緣帶內)。
 *   **用語**:位置 = 家 / 貼邊,區域 = 帶,選單文案 = 縮小按鈕 / 放大按鈕(不再用「收到邊 / 收合 / 小鈕 / 藍框」)。
 *   拖 40 圓鈕:鈕跟著游標;整段拖曳期間右緣帶(寬 36 = --field-height-md;上緣 = 貼邊鈕圓心落在視窗中線,
 *   下緣 = 貼邊鈕底離家頂一個 loose;貼邊區在下半部、永不與家重疊)以 drop-target 底色 + 三邊虛線框標出
 *   (貼右緣那側不畫;見 SNAP_ZONE_CLASSES);游標一進帶內,預覽當場變成 28 半圓**貼在右緣、停在放開會落的高度**
 *   (帶內所見即所得),放開就落定;放開在帶外 → 飛回家。
 *   拖 28 貼邊鈕:不顯示帶;帶內沿 y 移動;一出帶外當場變回 40 圓、放開飛回家(帶外沒有自由位置)。
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
  type AgentLogoState,
  BREATH_DUR,
  RIPPLE_KEYTIMES,
  RIPPLE_SPLINES,
  SETTLE,
  useBeginAnimationsOnMount,
  usePrefersReducedMotion,
} from './agent-panel-logo'

/** 靜止空拍段(值不變)。 */
const HOLD = '0 0 1 1'
/** 環向漸層(同 AgentLogo 兩緞帶代表色;藍在左下 = 220° 起點)。 */
const RING_GRADIENT = `conic-gradient(from 220deg, ${AGENT_BRAND.blue}, ${AGENT_BRAND.purple}, ${AGENT_BRAND.blue})`

export interface AgentFabProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * 標誌狀態 = **面板裡那個代理當下的狀態**(prop 名與 `AgentPanelHeader.logoState` 一致 —— 產品端同一個變數餵兩邊),面板關著也照跑(2026-09-03 user:「若開啟的 session 是思考中,
   * FAB 的 logo 也應該是思考中」)—— 入口鈕是該對話收起來的樣子,不是另一個獨立的東西:
   * `still` 靜止(閒置)/ `attract` 有新訊(標誌蓄勢 + 邊框光圈)/ `think` 思考中(代理正在回覆,標誌轉動)。
   * 收合成 28 貼邊鈕時同樣跟著跑(尺寸變、狀態不變)。
   */
  logoState?: AgentLogoState
}

/**
 * 招喚態的邊框光圈(呼吸包絡上的一道外散波)。**兩顆入口鈕共用**:AgentFab 與 AgentFabDock 都渲染它,
 * 否則產品實際用的 AgentFabDock 在有新訊時會完全沒有訊號(標誌的漣漪已被 ripple={false} 關掉,
 * 因為按鈕內放不下)。貼邊態省略(28 半圓貼著視窗邊,波會被切一半)—— 見 spec「AgentFab」節。
 * @internal AgentPanel 家族內部共用。
 */
function FabGlow() {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const glowId = `${uid}fg`
  const glowRef = React.useRef<SVGSVGElement | null>(null)
  useBeginAnimationsOnMount(glowRef, glowId)
  return (
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
  )
}

const AgentFab = React.forwardRef<HTMLButtonElement, AgentFabProps>(
  ({ logoState = 'still', className, 'aria-label': ariaLabel, ...props }, ref) => {
    const reduced = usePrefersReducedMotion()
    // 光圈只給招喚態(有新訊要人回頭看);思考態的訊號是標誌自己在轉,不加光圈以免兩個 loop 打架。
    const showGlow = logoState === 'attract' && !reduced
    return (
      <span className="relative inline-flex">
        {showGlow && <FabGlow />}
        {/* 漸層環畫在 button 自己身上(2px padding),整個看得見的圓 = 可點區域;環若做在外層 span,外圈 2px 就會是死區。 */}
        <button
          ref={ref}
          type="button"
          aria-label={ariaLabel ?? '開啟智慧代理'} // i18n-allow: DS 預設文案,aria-label prop 可覆寫
          className={cn(
            'inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-none p-[2px]',
            'shadow-[var(--elevation-200)] transition-[transform,box-shadow] duration-[var(--motion-duration-overlay)]',
            'hover:scale-[1.04] hover:shadow-[var(--elevation-200-hover)] motion-reduce:transition-none motion-reduce:hover:scale-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
          style={{ background: RING_GRADIENT }}
          {...props}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-raised">
            <AgentLogo state={logoState} ripple={false} size={24} />
          </span>
        </button>
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
 * 右緣帶(拖曳中才出現的暫態停靠區)= DS「可放下的區域」配對 `--drop-target` 底 + `--drop-target-border` 虛線框,
 * 貼邊那側不畫、不留圓角(2026-09-03 user 拍板;token 與兩種情境的分工 SSOT 在 color.spec.md「Drop target」段):
 * - 底色半透明(覆蓋在頁面內容上就不能不透明,VS Code theme-color 鐵律),兩模式同一公式,不用 --primary-subtle
 *   (那是元件自己的不透明淡底,底下沒有別人的內容)。
 * - 三邊 dashed:dashed = DS 的「可放下的暫時目標」語彙(file-upload.spec.md);貼右緣那側不畫線不留圓角,
 *   與 Sheet / Sidebar / AppShell 側欄 / 貼邊鈕(環只畫露出三邊)同一語言。
 * - 與 FileUpload 常駐拖入區的分工:那邊靜止就看得見、進入合法區只換邊框不填色;這裡憑空出現、需要整區訊號,
 *   而落點回饋由鈕自己的所見即所得預覽承擔。
 */
const SNAP_ZONE_CLASSES =
  'bg-drop-target border-2 border-r-0 border-dashed border-drop-target-border rounded-l-md'

/**
 * 形態表:每個合法位置(placement kind)長什麼樣、標誌多大、Tooltip 出現在哪、招喚要不要畫光圈。
 * 要新增磁吸點(例如鏡像左緣)= 這裡加一列 + `SNAP_ZONES` 加一列 + `AgentFabPlacement` 加一個 kind,
 * 拖曳 / 預覽 / 落定 / 鍵盤流程都不必動 —— 這張表就是「可擴充」的實際載體(spec「區域 → 落點表」)。
 */
interface ShapeSpec {
  /** 鈕的外徑(正圓直徑或半圓寬高)。 */
  px: number
  /** 內置標誌尺寸。 */
  logo: number
  /** 外框圓角(貼邊那側不留圓角)。 */
  radius: string
  /** 內面圓角(跟著外框)。 */
  innerRadius: string
  /** Tooltip 出現方向(避開它貼住的那一邊)。 */
  tooltipSide: 'top' | 'left' | 'right' | 'bottom'
  /** 招喚態是否畫邊框光圈(貼邊態省略:半圓貼著視窗邊,波會被切一半)。 */
  glow: boolean
}
const SHAPES: Record<Shape, ShapeSpec> = {
  home: { px: FAB_PX, logo: 24, radius: 'rounded-full', innerRadius: 'rounded-full', tooltipSide: 'top', glow: true },
  dock: { px: DOCK_PX, logo: 16, radius: 'rounded-l-full pr-0', innerRadius: 'rounded-l-full', tooltipSide: 'left', glow: false },
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))
/**
 * 貼邊鈕合法 y(鈕頂)範圍(user 2026-09-03 留言拍板):最高 = 圓心落在視窗中線(dockMinY);最低 = 鈕底離家頂
 * 一個 loose(dockMaxY = 舞台高 − 2·loose − 40 − 28),永不與家重疊、也不壓到分頁列。矮視窗放不下時整帶收成中線一點。
 */
const dockMinY = (s: Stage) => Math.floor(s.h / 2 - DOCK_PX / 2)
const dockMaxY = (s: Stage) => Math.max(dockMinY(s), s.h - 2 * s.inset - FAB_PX - DOCK_PX)
/**
 * 兩態的殼左上座標(拖曳引擎用:算抓取偏移與預覽落點)。殼恆為 40 寬、內容靠右:貼邊時 28 鈕靠在殼右緣 = 舞台右緣,
 * 形態過渡(40→28)在殼內縮、右緣不動 → 過渡中不會凸出舞台。
 */
const placementXY = (s: Stage, p: AgentFabPlacement): Point =>
  p.kind === 'dock'
    ? { x: s.w - FAB_PX, y: clamp(p.y, dockMinY(s), dockMaxY(s)) }
    : { x: s.w - s.inset - FAB_PX, y: s.h - s.inset - FAB_PX }

/**
 * **靜止時一律用 CSS `right` / `bottom` 從右下角錨定,不用量出來的 `left`**(2026-09-03 user 回報
 * 「小鈕左側點不到」「切 story 回來鈕不見了」的共同根因):
 * 以 `left = 量到的舞台寬 − 40` 定位時,只要量到的寬度比當下版面舊一格(捲軸出現的那一刻),鈕就會凸出可視區,
 * 凸出的那段 `elementFromPoint` 回 null = 點不到;而且鈕自己造成的水平溢出會生出捲軸 → 舞台變窄 → 位置更偏,
 * 量測與版面互相追成迴圈,ResizeObserver 判定 loop 後停手,鈕就卡在出界(或整顆看不見)的狀態。
 * 用 right/bottom 錨定後:x 不需要任何量測,永遠貼齊 padding box 邊緣、不可能溢出;量測只剩「夾 y」與「動畫」用途,
 * 因此**量不到尺寸時也照樣正確顯示**(不再需要 visibility 守衛)。
 */
const placementStyle = (s: Stage, p: AgentFabPlacement): React.CSSProperties => {
  if (p.kind === 'dock') {
    const y = s.h > 0 ? clamp(p.y, dockMinY(s), dockMaxY(s)) : Math.max(0, p.y)
    return { left: 'auto', right: 0, top: y, bottom: 'auto' }
  }
  // 家:量到高度就用 top(才能和貼邊態的 top 互相過渡);還沒量到就用 bottom —— 位置一樣正確,只是第一格不做動畫。
  return s.h > 0
    ? { left: 'auto', right: s.inset, top: s.h - s.inset - FAB_PX, bottom: 'auto' }
    : { left: 'auto', right: s.inset, top: 'auto', bottom: s.inset }
}
const inRect = (p: Point, r: Rect, pad: number) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

/**
 * 磁吸區域表:每列 = 「區域矩形(拖 40 圓鈕時就以底色標出)+ 指標在此區時的落點」。拖曳中的預覽 = 落點本身
 * (帶內所見即所得),放開就落定;指標不在任何區 → 40 圓鈕跟著游標,放開飛回家。判定用**指標**位置
 * (意圖在指尖;Windows Snap 看游標碰邊、Android Bubbles 看拖到關閉區),已在區內時多 16px 遲滯才算離開。
 * 要加磁吸點(鏡像左緣、四角…)只在此表加一列(必要時擴 AgentFabPlacement 的 kind),拖曳 / 預覽 / 底色流程不變
 * (spec「遮擋與貼邊」節「區域 → 落點表」)。
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
/**
 * 拖曳中的指標 → 判區用的舞台座標:x 夾在 [0, 舞台寬](超出右緣讀作右緣),y 不夾(理由見 `useSnapDrag` onMove 註解)。
 * 抽成純函式的原因:onMove 只有在 pointer capture 讓 `clientX` 超出視窗時才會走到「夾」這一步,沒有任何 story
 * 或瀏覽器閘會產生那種座標 —— 規則要有可重跑的證據,只能在這裡直接測(`scripts/test-agent-fab-drag-zones.mjs`)。
 */
const dragPoint = (s: Stage, dx: number, dy: number): Point => ({ x: clamp(dx, 0, s.w), y: dy })

/**
 * @internal 拖曳磁吸的純函式與常數(無 DOM),只給 `scripts/test-agent-fab-drag-zones.mjs` 單測消費;
 * 不是 consumer API(root barrel 排除,per-component subpath `export *` 仍看得到)。
 */
export const AGENT_FAB_DRAG_INTERNALS = { BAND_PX, DOCK_PX, HYSTERESIS, dockMinY, dockMaxY, dragPoint, findZone, SNAP_ZONES } as const

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

/**
 * 指標拖曳引擎:門檻、磁吸判定、放開落定、Esc / pointercancel 取消、吞掉拖曳後的 click;外殼只負責畫形狀與帶。
 * 對齊 DS 既有的指標拖曳 canonical(patterns/resize-handle):preventDefault + setPointerCapture + pointerId 過濾 +
 * touch-action none,否則觸控上 pointerdown 後瀏覽器接管捲動、指標移出視窗就收不到 pointerup。
 * 取消語意與放開分離:pointercancel(系統手勢 / 捲動接管)與 Esc 都**不 commit**,位置回到 props。
 */
function useSnapDrag(opts: {
  host: () => HTMLElement | null
  inset: number
  placement: AgentFabPlacement
  commit: (next: AgentFabPlacement) => void
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const dragRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    moved: boolean
    cancelled: boolean
    zone: SnapZone | null
    last: AgentFabPlacement | null
  } | null>(null)
  const suppressClickRef = React.useRef(false)
  // 卸載時把還掛著的 window listener 收乾淨(拖曳中被卸載 = 路由切換 / 受控 open 翻成 true / story 重掛)。
  const cleanupRef = React.useRef<() => void>(() => {})
  React.useEffect(() => () => cleanupRef.current(), [])
  const swallowNextClick = () => {
    // 拖曳放開後瀏覽器可能緊接著發 click(同元素)→ 吞掉;元素若已換態不會有 click → 下一 tick 清旗標。
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    // 已在拖曳中就忽略:第二次 pointerdown 會覆寫 `dragRef` 與 `cleanupRef`,第一組
    // pointermove/pointerup/pointercancel/keydown 就再也沒人移除(第一顆指標的 `onUp` 會因
    // pointerId 不符直接 return,永遠走不到 cleanup),監聽器會活過元件卸載(2026-09-04 稽核抓到)。
    if (dragRef.current) return
    const host = opts.host()
    if (!host) return
    e.preventDefault()
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* 舊瀏覽器 / 已釋放的指標:退回 window listener 即可 */
    }
    // 座標與渲染同源:absolute 子元素的原點是 padding box,故用 clientLeft/clientTop 與 clientWidth/clientHeight
    // (getBoundingClientRect 是 border-box、含捲軸,兩者混用時只要舞台有邊框或捲軸就會整體偏移)。
    const rect = host.getBoundingClientRect()
    const originX = rect.left + host.clientLeft
    const originY = rect.top + host.clientTop
    const stage: Stage = { w: host.clientWidth, h: host.clientHeight, inset: opts.inset }
    const origin = opts.placement.kind
    const cur = placementXY(stage, opts.placement)
    const grab: Point = { x: e.clientX - originX - cur.x, y: e.clientY - originY - cur.y }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      // Esc 取消後**不再更新預覽**:`onKey` 只設 `cancelled` 並清掉預覽,刻意不拆監聽(手指還按著,
      // 要等真正放開才結束)。少了這一行的話,下一個 pointermove 就會無條件重畫預覽鈕與右緣帶,
      // 使用者看到的是「按了 Esc 卻只安靜一瞬間」(2026-09-04 稽核抓到)。
      if (d.cancelled) return
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return
      d.moved = true
      // 指標的 x 夾在舞台內再判磁吸區(2026-09-04 user 抓到):
      // 右緣帶的矩形右界就是舞台右緣,而指標**可以**跑到視窗外(拖曳有 pointer capture,
      // `clientX` 不受視窗邊界限制)。夾之前,「拖過頭」= 落在帶的右邊 = 判定不在帶內 → 放開飛回家,
      // 但使用者的心智是「我已經推到最右邊了,而且更右邊根本沒有東西」。
      // 夾在舞台內之後,「超出右緣」讀作「就在右緣」,與那個心智一致;往左拖遠仍然正常離開帶
      // (夾的是上界,不是把所有位置都拉進來)。y 不夾 —— 帶的上下確實有合法的「不在帶內」區域。
      // 這條規則由純函式 `dragPoint` 承載,單測 `scripts/test-agent-fab-drag-zones.mjs` 守著
      // (2026-09-05 稽核:修好當天唯一的證據是一次手動合成指標紀錄,拿掉「夾」所有既有閘照樣綠)。
      const p = dragPoint(stage, ev.clientX - originX, ev.clientY - originY)
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
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      try {
        target.releasePointerCapture(e.pointerId)
      } catch {
        /* 已自動釋放 */
      }
      cleanupRef.current = () => {}
      dragRef.current = null
      setDrag(null)
    }
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      const { moved, cancelled, last } = d
      cleanup()
      if (!moved) return
      // 取消過(Esc)只吞掉這一次 click,不改位置;正常放開才落定。
      swallowNextClick()
      if (!cancelled) opts.commit(last ?? AGENT_FAB_HOME)
    }
    // pointercancel = 互動被系統中止(觸控捲動接管 / 手勢),語意不是放開 → 不 commit。
    const onCancel = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      const moved = d.moved
      cleanup()
      if (moved) swallowNextClick()
    }
    // Esc = 取消拖曳、回原位;但**不拆監聽** —— 使用者手指還按著,要等真正放開才結束(否則那個 click 會漏出去開面板)。
    const onKey = (ev: KeyboardEvent) => {
      const d = dragRef.current
      if (ev.key !== 'Escape' || !d?.moved || d.cancelled) return
      ev.preventDefault()
      d.cancelled = true
      setDrag(null)
    }
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, cancelled: false, zone: null, last: null }
    cleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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

/**
 * 本元件**自己必須擁有**、不接受 consumer 覆寫的 button prop。
 * 這些 handler 是拖曳引擎與選單的一部分(門檻判定、吞掉拖曳後的 click、右鍵開選單、鍵盤移動),
 * 被覆寫等於把「點了卻沒開」種回去;而 `disabled` 沒有對應的視覺(鈕長得一模一樣),
 * 傳了只會讓瀏覽器靜靜不派 click —— 型別層直接擋掉,比事後 debug 便宜
 * (兩條都由 2026-09-03 跨模型獨立審查點出)。
 */
type FabOwnedButtonProps = 'onPointerDown' | 'onClickCapture' | 'onContextMenu' | 'onKeyDown' | 'disabled'

export interface AgentFabDockProps extends Omit<AgentFabProps, 'className' | 'onClick' | FabOwnedButtonProps> {
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
      logoState = 'still',
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
    const buttonRef = React.useRef<HTMLButtonElement | null>(null)
    React.useImperativeHandle(ref, () => shellRef.current as HTMLDivElement)
    const host = () => (shellRef.current?.offsetParent as HTMLElement | null) ?? null
    // 舞台尺寸(offsetParent;ResizeObserver 跟隨)。
    const [size, setSize] = React.useState({ w: 0, h: 0 })
    // 被動 reflow(拖視窗邊界)期間關掉位置過渡,否則鈕會以 250ms 緩動一路拖尾追在角落後面。
    const [reflowing, setReflowing] = React.useState(false)
    React.useLayoutEffect(() => {
      let ro: ResizeObserver | null = null
      let retry: ResizeObserver | null = null
      let reflowTimer = 0
      let first = true
      const attach = () => {
        const el = host()
        if (!el) return false
        const update = () => {
          if (!first) {
            setReflowing(true)
            window.clearTimeout(reflowTimer)
            reflowTimer = window.setTimeout(() => setReflowing(false), 120)
          }
          first = false
          setSize({ w: el.clientWidth, h: el.clientHeight })
        }
        update()
        ro = new ResizeObserver(update)
        ro.observe(el)
        return true
      }
      // 掛載時祖先若是 display:none(收合的分頁 / 尚未啟用的路由),offsetParent 是 null;
      // 改觀察殼自己,等它有尺寸(= 祖先顯示了)再解析一次,否則舞台永遠停在 0×0、鈕停在左上角。
      if (!attach() && shellRef.current) {
        retry = new ResizeObserver(() => {
          if (attach()) {
            retry?.disconnect()
            retry = null
          }
        })
        retry.observe(shellRef.current)
      }
      return () => {
        window.clearTimeout(reflowTimer)
        ro?.disconnect()
        retry?.disconnect()
      }
    }, [])
    // 第一次量到舞台之前不開位置過渡(否則首幀會從預設位置滑進來);位置本身在量到之前就已正確(right/bottom 錨定)。
    const [ready, setReady] = React.useState(false)
    React.useEffect(() => {
      if (size.w > 0) setReady(true)
    }, [size.w])
    const inset = readPx(shellRef.current, '--layout-space-loose', 16)
    const stage: Stage = { w: size.w, h: size.h, inset }
    const { drag, onPointerDown, onClickCapture } = useSnapDrag({ host, inset, placement, commit: setPlacement })
    const [menuOpen, setMenuOpen] = React.useState(false)

    const shape: Shape = drag ? (drag.placement?.kind ?? 'home') : placement.kind
    const spec = SHAPES[shape]
    const isDock = shape === 'dock'
    const posStyle: React.CSSProperties = drag
      ? { left: 'auto', right: Math.max(0, stage.w - drag.x - FAB_PX), top: drag.y, bottom: 'auto' }
      : placementStyle(stage, placement)
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
      // 入口鈕整層包在一個與舞台等大的 clip 圖層裡。
      // 為什麼:招喚光圈畫在按鈕**外面** 2px、hover 又放大 1.04,鈕貼齊舞台右緣時這些裝飾會凸出去
      // → 文件被撐寬 → 視窗長出水平捲軸 → clientWidth 少 15 → 連鎖再長出垂直捲軸
      // (2026-09-03 實測:拖到右緣時 scrollWidth−clientWidth 由 0 變 12,兩根捲軸一起出現,放開還留著;
      //  溢出元素就是 FabGlow 的 `absolute left-1/2 top-1/2 -translate-*`)。
      // `overflow-clip` 只裁不捲:它不會變成捲動容器、也不會成為 fixed 的包含塊,所以裝飾在邊緣被切掉
      // (那正是視覺上該有的樣子 —— 光圈被視窗邊緣切一半),而且**任何狀態都不可能再長出捲軸**。
      // 圖層自己 `pointer-events-none`,按鈕仍是 `pointer-events-auto`,命中不受影響。
      <div className="pointer-events-none absolute inset-0 overflow-clip">
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
              // 同樣從右緣錨定(帶永遠貼右緣),避免用量到的 left 造成溢出迴圈。
              style={{ right: 0, top: r.y, width: r.w, height: r.h }}
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
            // **殼跟著鈕縮,不再固定 40 寬**(2026-09-04 user 回報「hover 出現 tooltip 的地方點不開」的根因之一):
            // 舊版把殼釘在 40,貼邊時鈕只有 28,左側就多出 12px 既不吃指標、又落在 tooltip 覆蓋範圍內的空白帶
            // (實測:hover 鈕中心 → tooltip 開;往左移 6px → 命中的是底下的表格、tooltip 仍開著;點下去面板不開)。
            // 殼是 `right` 錨定的,寬度縮到內容大小時右緣一樣不動,形態過渡(40→28)照樣不會凸出舞台,
            // 所以固定 40 這件事本來就沒有必要 —— 拿掉之後「殼 = 鈕」,不可能再有看不見的死區。
            'group/dock pointer-events-none absolute z-20 flex w-fit justify-end',
            // 落點修正 / 飛回家 250ms + enter;拖曳中跟指標不過渡。
            ready && !dragging && !reflowing && !reduced &&
              'transition-[right,top] duration-[var(--motion-duration-surface)] ease-[var(--motion-easing-enter)]',
            dragging ? 'cursor-grabbing select-none' : 'cursor-grab',
            className,
          )}
          // 舞台尺寸量到前先隱藏(否則首影格會以 0×0 舞台算成左上角再跳到右下角)。
          style={posStyle}
        >
          {/* 招喚態光圈:與獨立 AgentFab 同一顆元件;貼邊態省略(半圓貼邊,波會被切一半)。 */}
          {logoState === 'attract' && !reduced && spec.glow && (
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <FabGlow />
            </span>
          )}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
            {/* 選單只由右鍵 / Shift+F10 開;錨點 = 蓋住鈕的透明 span(pointer-events-none,不攔點擊)。
                關閉後 Radix 會把焦點還給 trigger,但 trigger 是 aria-hidden 的錨點 → 顯式導回真正的按鈕。 */}
            <DropdownMenuTrigger asChild>
              <span aria-hidden className="pointer-events-none absolute inset-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                buttonRef.current?.focus()
              }}
            >
              {placement.kind === 'home' ? (
                <DropdownMenuItem startIcon={ArrowRightToLine} onSelect={() => setPlacement({ kind: 'dock', y: dockMaxY(stage) })}>{text.dock}</DropdownMenuItem>
              ) : (
                <DropdownMenuItem startIcon={ArrowLeftFromLine} onSelect={() => setPlacement(AGENT_FAB_HOME)}>{text.home}</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* **不加 `disableHoverableContent`**,用 Radix 預設(2026-09-04 定案):
              tooltip 與觸發點恆距 8px(`OVERLAY_SIDE_OFFSET`),兩者不重疊,所以 tooltip 從來就不會
              擋住這顆鈕的點擊 —— 我一度以為要靠這個旗標才能讓「tooltip 範圍 = 可點範圍」,那是誤判。
              關掉 hoverable 反而會讓指標一離開 trigger 就立刻關閉,直接命中 WCAG **F95**
              (Failure of SC 1.4.13:content shown on hover not being hoverable)。 */}
          <Tooltip open={dragging ? false : undefined}>
            <TooltipTrigger asChild>
              {/* **命中形狀 ≡ 可視形狀**(2026-09-04 user 拍板原話:
                  「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」)。
                  作法:語意 `<button>` 的尺寸與圓角**都等於可視形狀**(貼邊 28 + `rounded-l-full`、
                  在家 40 + `rounded-full`);漸層環是這一層自己的 2px padding,內層 span 只負責面色,
                  所以按鈕的 border box 邊緣就是使用者看到的邊緣。
                  DOM 盒 / 無障礙 target / 命中區 / Radix 錨點四者是同一個形狀。

                  **不外推**(2026-09-03 曾外推到 40×40,已撤回):外推會生出隱形帶,搶走底下內容的點擊,
                  並把 Radix 錨點推遠(tooltip 離可視形狀 20px 而不是 8px)。
                  **也不內縮**:先前寫成「按鈕保持矩形、圓角只畫內層,角落才點得到」——
                  那是把**多**當成修正,使用者要的是相等。

                  **貼邊鈕壓在別人的捲軸上時,鈕贏**(同日 user 拍板:「按鈕是蓋在表格上,
                  fab 通常也都是 z index 最上面的東西」)。實測貼邊鈕與 DataTable 垂直捲軸重疊約 11px,
                  在重疊區以真實滑鼠點擊 → 面板開啟、`scrollTop` 不變。
                  注意 `document.elementFromPoint` **看不到原生捲軸**,這一條只能用真實指標事件驗。 */}
              <button
                type="button"
                className={cn(
                  // touch-none:觸控上不讓瀏覽器把 pointerdown 解讀成捲動(同 resize-handle canonical),否則拖曳在手機不可用。
                  // **寫上 `spec.radius`,讓命中形狀 = 可視形狀**(2026-09-04 user 拍板:
                  // 「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」)。
                  // 圓角外的角落看不到,所以也不該點得到 —— 三者恆等,沒有例外可以解釋。
                  // 先前寫成「按鈕保持矩形、圓角只畫內層」的理由是「角落才點得到」,那是把
                  // **多**當成修正:使用者要的是相等,不是更大。
                  // (2026-09-03 曾記錄「貼邊態 dy=±12 時最左 1–3px 點不到」並歸因於圓角命中 ——
                  //  複核幾何後那是誤判:D 形在 dy=±12 的高度上,左緣本來就在 x≈6.8 而不是 x=0,
                  //  那幾個點原本就在**視覺之外**,不該算死區。)
                  'group/fab pointer-events-auto inline-flex touch-none cursor-[inherit] items-center justify-center border-none bg-transparent p-0',
                  spec.radius,
                  'transition-[width,height,transform] duration-[var(--motion-duration-overlay)] ease-[var(--motion-easing-enter)] motion-reduce:transition-none',
                  // 懸停微放大掛在**按鈕**上:命中盒與可視形狀一起放大,兩者永遠同步
                  // (掛在內層的話,放大後可視會比命中盒大一圈)。值與獨立 AgentFab 同一組。
                  !dragging && 'hover:scale-[1.04] motion-reduce:hover:scale-100',
                  'focus-visible:outline-none',
                )}
                {...buttonProps}
                // **尺寸寫在 spread 之後**:可視形狀改成 `h-full w-full` 之後,寬高的唯一住所就是這裡;
                // 若排在 `{...buttonProps}` 之前,consumer 傳一個 `style` 就會整個蓋掉 width/height,
                // 按鈕塌成 0×0、內層 100% of 0 也是 0 → 整顆鈕消失(2026-09-04 稽核抓到)。
                // consumer 的其他 style 屬性照樣保留,只有尺寸由本元件擁有。
                style={{ ...buttonProps.style, width: spec.px, height: spec.px }}
                ref={buttonRef}
                aria-label={buttonLabel}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                // 自有 handler 一律放在 spread **之後**:型別已擋(見 FabOwnedButtonProps),
                // 這裡再擋一層執行期(JS consumer / as any 繞過型別)。
                onPointerDown={onPointerDown}
                onKeyDown={onKeyDown}
                onClickCapture={onClickCapture}
                onClick={onClick}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenuOpen(true)
                }}
              >
                {/* 可視形狀:漸層環 = 這一層自己的 2px padding,內層 span 只負責面色。
                    寬高與圓角在兩態間過渡 150ms,拖曳中當場變形 = 所見即所得。 */}
                <span
                  aria-hidden
                  className={cn(
                    'flex h-full w-full items-center justify-center p-[2px] shadow-[var(--elevation-200)]',
                    'transition-[border-radius,box-shadow] duration-[var(--motion-duration-overlay)] ease-[var(--motion-easing-enter)] motion-reduce:transition-none',
                    spec.radius,
                    // 陰影升一級(微放大由按鈕負責,見上)。與獨立 AgentFab 同一組 token。
                    !dragging && 'group-hover/fab:shadow-[var(--elevation-200-hover)]',
                    // 焦點圈畫在可視形狀上,不是那個沒有圓角的按鈕盒(否則焦點圈會是方的)。
                    'group-focus-visible/fab:ring-2 group-focus-visible/fab:ring-ring group-focus-visible/fab:ring-offset-2',
                  )}
                  style={{ background: RING_GRADIENT }}
                >
                  <span className={cn('flex h-full w-full items-center justify-center bg-surface-raised', spec.innerRadius)}>
                    <AgentLogo state={logoState} ripple={false} size={spec.logo} />
                  </span>
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side={spec.tooltipSide}>{isDock ? text.tooltipDock : text.tooltip}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    )
  },
)
AgentFabDock.displayName = 'AgentFabDock'

/* ────────────────────────────────────────────────────────────────────────────
 * AgentPanelDock — 「面板 ↔ 入口鈕」互斥外殼(spec「放置與互斥」)
 * ──────────────────────────────────────────────────────────────────────── */

export interface AgentPanelDockRenderProps {
  /** 關閉面板 → 入口鈕回到上次的位置。接到 AgentPanelHeader 的 onClose。 */
  close: () => void
  /** 目前的代理狀態(與入口鈕標誌同一個值);接到 AgentPanelHeader 的 logoState。 */
  logoState: AgentLogoState
}

export interface AgentPanelDockProps
  extends Omit<AgentFabDockProps, 'onClick' | 'children' | 'logoState'> {
  /** 入口鈕位置(受控);省略 = 由本元件保管,面板開關不會忘記(見下方註解)。 */
  /** 面板是否開啟(受控);省略 = 非受控。 */
  open?: boolean
  /** 非受控初始開關;預設開。 */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** 代理狀態:面板標題列與入口鈕標誌吃同一個值(關著面板也照跑)。 */
  logoState?: AgentLogoState
  /** 面板內容;關閉時不渲染(與入口鈕互斥)。 */
  children: (props: AgentPanelDockRenderProps) => React.ReactNode
}

/**
 * 面板與入口鈕互斥的唯一住所:開 → 只有面板(× 關閉);關 → 只有入口鈕(點一下開回來),
 * 入口鈕位置與標誌狀態都留在這裡,產品端不必各自寫一份(2026-09-03 user:「所有範例的關閉按鈕都可以加上去了」)。
 * 外層容器需 `relative`(入口鈕以 absolute 定位在其中)。
 */
const AgentPanelDock = React.forwardRef<HTMLDivElement, AgentPanelDockProps>(
  (
    {
      open: openProp,
      defaultOpen = true,
      onOpenChange,
      logoState = 'still',
      children,
      placement: placementProp,
      defaultPlacement = AGENT_FAB_HOME,
      onPlacementChange,
      ...fabProps
    },
    ref,
  ) => {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
    const open = openProp ?? uncontrolledOpen
    const setOpen = React.useCallback(
      (next: boolean) => {
        if (openProp === undefined) setUncontrolledOpen(next)
        onOpenChange?.(next)
      },
      [openProp, onOpenChange],
    )
    // 非受控位置**住在這裡**,不能住在 AgentFabDock —— 面板開著時那顆會被卸載,state 會跟著消失,
    // 使用者收到邊、開面板、關面板後鈕就跑回右下角(2026-09-03 稽核抓到)。
    const [uncontrolledPlacement, setUncontrolledPlacement] = React.useState<AgentFabPlacement>(defaultPlacement)
    const placement = placementProp ?? uncontrolledPlacement
    const handlePlacementChange = React.useCallback(
      (next: AgentFabPlacement) => {
        if (placementProp === undefined) setUncontrolledPlacement(next)
        onPlacementChange?.(next)
      },
      [placementProp, onPlacementChange],
    )
    const close = React.useCallback(() => setOpen(false), [setOpen])
    if (open) return <>{children({ close, logoState })}</>
    return (
      <AgentFabDock
        ref={ref}
        logoState={logoState}
        placement={placement}
        onPlacementChange={handlePlacementChange}
        onClick={() => setOpen(true)}
        {...fabProps}
      />
    )
  },
)
AgentPanelDock.displayName = 'AgentPanelDock'

export { AgentFab, AgentFabDock, AgentPanelDock }
