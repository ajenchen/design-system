import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/design-system/components/Tooltip/tooltip"
import { ICON_SIZE, type RowSize } from "@/design-system/tokens/uiSize/icon-size"
import { useRowSize } from "@/design-system/patterns/element-anatomy/item-anatomy"

/**
 * InfoTooltip —— ⓘ 說明圖示:淡色 ⓘ,滑過 / 聚焦時用 Tooltip 顯示一句補充說明(規則住 info-tooltip.spec.md,本處不重述)。
 *
 * ── 消費的 SSOT ──
 * - 長相 / 游標 / 不上底色:ds-canonical/references/hit-area-canonical.md 三-1「給你看資訊的東西」(平常 fg-muted、滑過 fg-secondary、一般箭頭)
 * - 圖示尺寸:tokens/uiSize/icon-size.ts `ICON_SIZE`(uiSize.spec.md「Icon 尺寸 Tier」:sm / md 16、lg 20);
 *   不傳 size 時讀所在列的尺寸 `useRowSize`(patterns/element-anatomy/item-anatomy,與 ItemIcon 同一個查法),列外 = md
 * - 浮出說明:components/Tooltip(TooltipTrigger / TooltipContent;滑過與 Tab 聚焦都會開,tooltip.spec.md「A11y 預設」)
 * - 鍵盤焦點框:全域 base.css 的 :focus-visible(本元件不另寫 outline)
 * - 抽出來源:原本寫在 components/Field/field.tsx FieldLabel 裡的那一顆(2026-11-27 起 FieldLabel 改用本元件,長相與行為不變)
 */

export interface InfoTooltipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  /**
   * 說明文字:滑過 / 聚焦時 Tooltip 顯示的那一句,同時是這顆的讀屏名稱。
   * 名字同 FieldLabel 的 `info`(同一句話在 DS 裡已叫 info,info-tooltip.spec.md「命名」)。空字串時不要放這顆。
   */
  info: string
  /**
   * 圖示尺寸,照 icon tier(sm / md 16、lg 20)。不傳 = 所在容器傳下來的列尺寸(Sidebar、選單 / 指令面板的內容區等),
   * 都沒有 = md(16)。覺得不夠大再自己傳(info-tooltip.spec.md「尺寸」)。
   */
  size?: RowSize
}

const InfoTooltip = React.forwardRef<HTMLButtonElement, InfoTooltipProps>(
  ({ info, size: sizeProp, className, ...props }, ref) => {
    const rowSize = useRowSize("md")
    const size = sizeProp ?? rowSize
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={info}
            data-slot="info-tooltip"
            // 滑過深一階 = 告訴你「這裡有說明可看」(hit-area-canonical.md 三-1);不上底色。
            // 游標明寫 cursor-default:點下去不做事(Radix Tooltip 點擊只會收起說明),不能用手形;
            // base.css 讓所有 <button> 預設手形,只刪 cursor-pointer 蓋不掉(2026-09-26,原 FieldLabel 那一顆的理由)
            className={cn(
              "inline-flex items-center text-fg-muted hover:text-fg-secondary bg-transparent border-0 p-0 cursor-default",
              className,
            )}
            {...props}
          >
            <Info size={ICON_SIZE[size]} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{info}</TooltipContent>
      </Tooltip>
    )
  },
)
InfoTooltip.displayName = "InfoTooltip"

// Story auto-compile metadata(key 對齊 info-tooltip.spec.md frontmatter `sizes`;數值只住 ICON_SIZE)
export const infoTooltipMeta = {
  component: "InfoTooltip",
  family: "self-contained",
  variants: {},
  sizes: {
    sm: {},
    md: {},
    lg: {},
  },
  states: ["default", "hover", "focus"],
  tokens: {
    bg: [],
    fg: ["text-fg-muted", "text-fg-secondary"],
    ring: [],
  },
} as const

export { InfoTooltip }
