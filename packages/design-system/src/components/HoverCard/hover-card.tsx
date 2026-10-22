/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Avatar(hoverCard)/ OverflowIndicator 等 DS 元件 wrap 消費,end-user app 請用 wrapper 元件。
 */
import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"
import { OVERLAY_SIDE_OFFSET, OVERLAY_HIDE_WHEN_DETACHED } from "@/design-system/tokens/elevation/overlay-geometry"
import { MOTION_DELAY_RICH_MS, MOTION_DELAY_CLOSE_MS } from "@/design-system/tokens/motion/motion"
import { overlayMotion } from "@/design-system/tokens/motion/overlay-motion"

/**
 * HoverCard — hover 顯示可互動內容的浮層（行為 primitive）
 *
 * 跟 Tooltip 的差異：內容可互動（按鈕、連結、hover 子元素）。
 *
 * **不含視覺樣式**——bg、border、shadow、padding 由 consumer 決定。兩種常見外殼各有一份常數(下方),所有使用方消費它、不另抄:
 * - ProfileCard / 內容預覽:`HOVER_CARD_SURFACE_CLASS`(亮色卡片殼,跟隨頁面主題)
 * - OverflowIndicator 溢出清單:`HOVER_CARD_TOOLTIP_SURFACE_CLASS` + `data-theme="dark"`(深色 tooltip 殼)
 *
 * 只提供：z-index、動畫、sideOffset。
 */

/**
 * 亮色卡片殼(人員卡、連結 / 儲存庫預覽):跟隨頁面主題的浮起面 —— 底色 / 字色 / 邊框 / 圓角 / elevation-200 同 Popover 殼
 * (popover.tsx PopoverContent;tokens/elevation/elevation.spec.md 配對規則)。**不含內距**:ProfileCard 自帶內距,自訂內容自己加。
 * hover-card.spec.md「純行為 primitive」表第 1 列的唯一住所:Avatar hoverCard 內建外殼(avatar.tsx)與所有 story 都消費這一份。
 * 2026-10-20 前這個殼在 DS 裡手抄 14 處、寫法各異(陰影寫在 class / style、有無字色),其中 6 處沒有陰影、1 處連底色邊框都沒有
 * (獨立驗證 OV-V03 / OV-06;M17)。閘:scripts/overlay-story-contract-invariant.mjs S2(HoverCardContent 一律消費這兩份常數)。
 */
export const HOVER_CARD_SURFACE_CLASS = 'bg-surface-raised text-foreground border border-border rounded-lg shadow-[var(--elevation-200)]'

/**
 * 深色 tooltip 殼(+N 溢出清單):**一定要跟 `data-theme="dark"` 寫在同一個元素上**,而且字色在這一層重新解析(`text-foreground`)——
 * CSS 的 `color` 從外面繼承的是**已解析的值**,`data-theme` 只換變數不換 color;只寫 data-theme 的深色殼,文字是頁面主題的黑字
 * (2026-10-20 前淺色頁量到 1.92:1,獨立驗證 OV-02;規則同 alert.tsx 檔頭「data-theme 必須搭配 text-foreground」與 M3)。
 * hover-card.spec.md「純行為 primitive」表第 2 列的唯一住所:OverflowIndicator 與設計規格頁都消費這一份。
 */
export const HOVER_CARD_TOOLTIP_SURFACE_CLASS = 'bg-tooltip text-foreground rounded-lg'

// 2026-06-11 user 拍板 A 案(「確保所有 hover 延遲都有按照設計原則」):Root 預設接 motion token SSOT
// (rich 700ms open / close 200ms)— 對齊 tooltip.tsx 同 pattern(2026-05-18 拍板 #3A)。
// 原裸用 Radix 預設 open 700 / close 300:open 巧合同值、close 300 ≠ canonical 200(drift)。
// Consumer 仍可 per-instance override(Avatar 同值傳入、OverflowIndicator 傳 plain)。
const HoverCard = ({ openDelay = MOTION_DELAY_RICH_MS, closeDelay = MOTION_DELAY_CLOSE_MS, ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) => (
  <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />
)

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = OVERLAY_SIDE_OFFSET, collisionPadding = 12, hideWhenDetached = OVERLAY_HIDE_WHEN_DETACHED, ...props }, ref) => (
  // HoverCardPrimitive.Portal(2026-04-23):把 Content 搬到 `document.body`。
  // 不 Portal 時 Content 會 DOM-nested 在 trigger subtree,如 trigger 位於 OverflowIndicator
  // `data-theme="dark"` tooltip 內部 → Avatar 自帶 HoverCard 的 Content 也卡在 dark subtree,
  // CSS var(--foreground) 繼承 dark 值 → ProfileCard 內部文字變 white 看不見(user 抓的 bug)。
  // Portal 到 body 讓 CSS 繼承 chain 從 app root data-theme 起算,不受 trigger subtree 污染。
  //
  // collisionPadding=12:Radix / browser 內部 1-2px rounding 讓 visual padding 比 prop 值少 1-2px。
  // 提高到 12 保證使用者實際看到 ≥ 8px viewport edge gap(overlay-surface「靠邊 8px」canonical)。
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      // 錨點失去版面時不畫(同 Tooltip;詳 tokens/elevation/overlay-geometry.ts)
      hideWhenDetached={hideWhenDetached}
      className={cn(
        // @focus-suppress E — E 浮層程式落點;承擔者:浮層開啟時的程式落點
        "z-50 outline-none",
        // 2026-05-04 viewport-aware max-h SSOT(對齊 Popover):header/footer 永遠 in-viewport,body 壓縮 scroll
        // 2026-05-05 audit dim 35 fix:加 `min-h-0` 完成 M25 chain invariant
        "max-h-[var(--radix-hover-card-content-available-height,100vh)] flex flex-col overflow-hidden min-h-0",
        // 何時播 / 時長 / 曲線 / 收尾 / 減少動態 = overlayMotion(tokens/motion/overlay-motion.ts;與 Popover / DropdownMenu / Tooltip 同一份);
        // 這裡只寫幾何。(2026-07-05 曾在此補 motion-reduce 豁免,但那條守衛的權重輸給 data-[state=…]:animate-*,
        // 從來沒生效 —— 2026-10-07 改由 overlayMotion 只在 motion-safe 下宣告動畫,待辦總帳 T7)
        overlayMotion,
        "data-[state=closed]:fade-out-0 not-data-[state=closed]:fade-in-0",
        "data-[state=closed]:zoom-out-95 not-data-[state=closed]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[var(--radix-hover-card-content-transform-origin)]",
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const hoverCardMeta = {
  component: 'HoverCard',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    // 2026-07-16 deep-audit A.1b:清 Phase-1 佔位 — HoverCard 為純行為 primitive,
    // Content 不套任何 bg/fg(spec「純行為 primitive」段);bg-surface-raised 屬 consumer(ProfileCard)。
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { HoverCard, HoverCardTrigger, HoverCardContent }
