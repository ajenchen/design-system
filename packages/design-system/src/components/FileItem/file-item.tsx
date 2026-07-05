// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Paperclip, CircleCheck, XCircle, Download, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { ProgressBar } from '@/design-system/components/ProgressBar/progress-bar'
import { ItemContent, ItemPrefix } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * FileItem — 檔案顯示 / 上傳進度
 *
 * Typography: 兩 mode 統一 scanning — text-body (14px) + leading-compact (1.3)(詳 spec「Typography」段,2026-04-23)
 *
 * 兩種 mode（精簡 vs 完整內容呈現）:
 *
 * compact（★ default）: Paperclip 16px 在左。右側 content + bar。
 *   padding 詳 spec「Padding」表(form: px-3 py-2;surface=upload-manager: px-0 保留 py-2)。
 *   description 只有 error 才顯示。
 *   bar 跟文字左邊對齊（在 icon 右邊的 column 內）。
 *
 * rich: Avatar 48px square 在左（顯示檔案內容縮圖）。右側 content + bar。
 *   多行 description（size / status message）。
 *   有 bar → justify-between（bar 底部對齊 avatar）
 *   無 bar → justify-center（文字垂直置中對齊 avatar）
 *
 * status 可選。不傳 = 已上傳檔案（無 bar，可點擊下載）。
 * onClick → 只加 cursor-pointer(**永不顯示 hover-bg**;FileItem 三型態皆 permanent-anchored,詳 spec「Hover 行為 canonical」)。
 */

const STATUS_ICON = {
  completed: { icon: CircleCheck, color: 'text-success' },
  error: { icon: XCircle, color: 'text-error' },
} as const

// ProgressBar status 映射:uploading=inProgress(藍) / completed=success(綠) / error=error(紅)
// 與 ProgressBar 元件的 status prop 對齊,不需再維護 PROGRESS_COLOR 本地 map。
const PROGRESS_STATUS_MAP = {
  uploading: 'inProgress',
  completed: 'success',
  error: 'error',
} as const

const AVATAR_SIZE = 48
const ICON_PX = 16

export interface FileItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  name: string
  /**
   * 兩種呈現 mode（精簡 vs 完整）：
   * - `compact`（預設）：paperclip + filename 單行 inline
   * - `rich`：縮圖 + 檔名 + size + status + progress 的完整 card 呈現
   */
  mode?: 'compact' | 'rich'
  /**
   * 清單所在的 surface context（2026-06-03 codify rich-borderless）：
   * - `form`（預設）：rich = border card（自立輪廓，Slack/Notion/Linear attachment 慣例）
   * - `upload-manager`：rich = **無邊框**（Google Drive/Dropbox 上傳管理面板 —— 面板自身已是容器，
   *   card border 多餘 = 雙層容器）；avatar 作每筆 item 視覺邊界。compact 的進度條/灰底不受 surface 影響
   *   （由 status 決定）。
   * surface-driven（非 status-driven）：避免 form 內 rich 上傳中變無邊框、存好變 card 的邊框閃爍。
   * 列間 gap 由 List wrapper canonical 決定（form rich 8px / upload-manager rich 12px tight / compact 4px，見 spec）。
   */
  surface?: 'form' | 'upload-manager'
  status?: 'uploading' | 'completed' | 'error'
  progress?: number
  /** rich mode: 檔案大小、狀態訊息。compact: 只有 error 才顯示。 ReactNode 支援 inline clickable link(如「View log」)。 */
  description?: React.ReactNode
  thumbnailSrc?: string
  actions?: React.ReactNode
  onClick?: () => void
  /**
   * Hover 動作(passive 狀態 icon 變互動 button 的 UX):
   * - `onDownload`:有值時,`status="completed"` 的綠 ✓ icon 在 row hover 時
   *   換成 Download ↓ button;click 觸發 onDownload。無值保持 passive 綠 ✓。
   * - `onRetry`:有值時,`status="error"` 的紅 ✗ icon 在 row hover 時換成 RotateCw ⟲
   *   button;click 觸發 onRetry。無值保持 passive 紅 ✗。
   *
   * 世界級對照:Gmail / Slack / Dropbox 附件的 passive 狀態 → hover 變 action
   * 的 UX,使用者知道檔案狀態且能立即行動。
   */
  onDownload?: () => void
  onRetry?: () => void
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const FileItem = React.forwardRef<HTMLDivElement, FileItemProps>(
  (
    {
      name,
      mode = 'compact',
      surface = 'form',
      status,
      progress = 0,
      description,
      thumbnailSrc,
      actions,
      onClick,
      onDownload,
      onRetry,
      className,
      ...props
    },
    ref,
  ) => {
    const isRich = mode === 'rich'
    const hasStatus = !!status
    const statusConfig = status && status !== 'uploading' ? STATUS_ICON[status] : null
    const progressWidth = status === 'completed' ? 100 : progress

    // compact 只有 error 才顯示 description
    const showDesc = isRich ? !!description : (status === 'error' && !!description)

    // Hover 行為 canonical(2026-04-23 user 校準):**FileItem 永不顯示 hover-bg**。
    // 三種型態都有永久 visual anchor:rich = border card / compact 無 status = bg-secondary /
    // compact 有 status = 底部 progress bar(分隔線型 affordance)——再加 hover-bg 是
    // double-emphasis,視覺雜。世界級共識(Slack / Notion / Figma / Gmail 皆無 hover-bg):
    // permanent-anchored 元件 hover 只靠 cursor + action icon fade / border highlight,
    // 不靠 row bg。onClick 存在時只給 `cursor-pointer`,affordance 靠 cursor + 點擊行為本身。
    const hoverClass = onClick ? 'cursor-pointer' : ''

    // 消費 ProgressBar 元件(SSOT);不再自 roll bar。
    // height override:compact mode 用 2px(極密集 row layout),rich mode 用預設 4px。
    // 這是 ProgressBar `height` prop 的唯一合法 consumer(見 progress-bar.tsx docblock)。
    // a11y(2026-04-25 axe aria-progressbar-name):aria-label 用 file name 作 context。
    const progressBar = hasStatus ? (
      <ProgressBar
        value={progressWidth}
        status={PROGRESS_STATUS_MAP[status!]}
        height={isRich ? undefined : 2}
        aria-label={`${name} 上傳進度`}
      />
    ) : null

    // suffix 對齊 label 第一行(item-anatomy「24px 閾值對齊規則」小 suffix canonical):
    // icons 16 ≤ 24 屬小 suffix,統一 `h-[1lh]` inline,不因 desc wrap 改公式。
    // 兩 mode 同公式,跟 item-anatomy 一致。
    const suffixAlign = 'h-[1lh]'

    // Status slot 幾何(2026-04-23 user 統一):rich + compact 都用 `var(--field-height-xs)`(24)
    // 容器,裡面 Button xs iconOnly variant="text"(auto data-unbounded)。
    // Compact 不影響 row 高度 = suffix wrapper 的 data-unbounded CSS 讓 Button layout
    // 收斂到 1lh(同 compact row 內容高),視覺/touch target 仍 24。
    const slotHw = 'var(--field-height-xs)'

    const hoverAction =
      status === 'completed' && onDownload ? { icon: Download, onClick: onDownload, label: '下載' } :
      status === 'error' && onRetry        ? { icon: RotateCw, onClick: onRetry,    label: '重試' } :
      null

    const statusSlot = statusConfig ? (
      <span
        data-unbounded="true"
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: slotHw, height: slotHw }}
      >
        {/* Passive 狀態 icon:預設可見;若有 hover-swap,row-hover 時淡出 */}
        <statusConfig.icon
          size={ICON_PX}
          className={cn(
            'shrink-0 transition-opacity',
            statusConfig.color,
            // 2026-07-05 D4:鍵盤 focus 同步觸發 swap(:has(:focus-visible),對齊 item-anatomy SUFFIX_HOVER_REVEAL_BY_GROUP SSOT)
            hoverAction && 'group-hover/row:opacity-0 group-has-[:focus-visible]/row:opacity-0',
          )}
          aria-hidden
        />
        {/* Active action:row-hover 時淡入(rich + compact 同 Button xs 統一) */}
        {hoverAction && (
          <Button
            variant="text"
            size="xs"
            iconOnly
            startIcon={hoverAction.icon}
            aria-label={hoverAction.label}
            onClick={(e) => { e.stopPropagation(); hoverAction.onClick() }}
            className="absolute inset-0 opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 transition-opacity"
          />
        )}
      </span>
    ) : null

    const suffix = (
      <div
        className={cn(
          'flex items-center gap-2 shrink-0',
          suffixAlign,
          // data-unbounded chrome-canonical trick:let Button xs (24) live inside h-[1lh]
          // wrapper(compact ~18.2 / rich ~18.2 scanning)without pushing row height。
          // 視覺/hit area 仍 24,layout footprint 收斂到 1lh。同 overlay-surface
          // 的 SurfaceHeader dismiss canonical(2026-04-22 v5)。
          // **child selector `[&>[data-unbounded]]`(非 descendant)**:只針對 suffix
          // wrapper **直接子元素**(statusSlot span、actions Button)套 margin,
          // 避免 status slot 內部 hover-swap Button(nested)也套造成 layout 跳動。
          '[&>[data-unbounded]]:my-[calc((1lh-var(--field-height-xs))/2)]',
        )}
      >
        {status === 'uploading' && isRich && (
          <span className="text-fg-secondary tabular-nums">{progress}%</span>
        )}
        {statusSlot}
        {actions}
      </div>
    )

    // content row — 消費 ItemContent primitive(封裝 label + desc + mt-gap token SSOT)。
    // 兩 mode 共用:primitive 改 → 兩 mode 同步,不需 grep。
    // typography:scanning mode(2026-04-23 user 指示)—— label body(14/1.3) + desc caption(12/1.3);
    // row 本身加 `leading-compact` 配合 scanning idiom(同 MenuItem row)。
    const contentRow = (
      <div className="flex items-start gap-2">
        <ItemContent
          label={name}
          description={showDesc ? description : undefined}
          mode="scanning"
          descriptionTone={status === 'error' ? 'error' : 'secondary'}
        />
        {suffix}
      </div>
    )

    // a11y(2026-04-25 nested-interactive fix):FileItem row 含 inner interactive
    // (hover-swap action button / ProgressBar / Avatar hoverCard trigger)。原本
    // role='button' + tabIndex=0 整列可鍵盤點,與 inner buttons 構成 nested-interactive
    // (axe serious)。移除 row 層 button semantic → mouse 仍可點(onClick 保留),
    // 鍵盤 user 直接 tab 到 inner primary action。Trade-off:失去「整列 Enter 開啟」
    // 但滿足 WCAG;世界級對照:Slack message row / Notion page row 同模式 — row 只
    // mouse 點,inner 有 explicit 按鈕負責鍵盤。
    const rowA11y = {}

    // Compact 靜態背景(AR20):無進度條 → 顯示 `bg-secondary`(= neutral-3)作「檔案已上傳 /
    // 靜態列表」視覺區隔,跟「上傳中(有 progress bar)」對照。hover 不改 bg(見上方
    // hoverClass canonical:FileItem 永不顯示 hover-bg)。
    // **為什麼 bg-secondary 不 bg-neutral-3**:`bg-neutral-3` 不是合法 Tailwind utility
    // (primitive token `--color-neutral-3` 沒經 `@theme inline` 橋接);`bg-secondary`
    // 是 semantic token 橋接的 utility(見 `tokens/color/semantic.css`@theme inline),
    // 底色同樣指向 `--color-neutral-3`。對齊 Badge low / ProgressBar track SSOT。
    const compactStaticBg = !progressBar ? 'bg-secondary' : ''

    // ── rich(含縮圖完整呈現)——AR17 canonical:加邊框 + gap-2 ──
    // Rich mode 是「檔案 card」風格,外框讓每個 row 視覺上是獨立 card
    // (Slack / Notion / Linear attachment 慣例)
    if (isRich) {
      return (
        <div
          ref={ref}
          className={cn(
            'group/row flex items-start gap-2 w-full text-body leading-compact transition-colors',
            // surface=form → border card(自立輪廓);surface=upload-manager → 無邊框(box 自身是容器,
            // avatar 作 item 邊界)。2026-06-03 codify rich-borderless(原僅 spec 旁註,consumer 自己移除)。
            // 2026-06-03 圖五:upload-manager rich 拿掉 px+py(卡片移除後 py 多餘,列高靠 avatar 48 的 content minHeight;
            // 容器 + gap 控制間距)。form 保留 px-3 py-3 卡片內距。
            surface === 'upload-manager' ? 'rounded-md' : 'px-3 py-3 border border-divider rounded-md bg-surface',
            hoverClass,
            className,
          )}
          onClick={onClick}
          {...rowA11y}
          {...props}
        >
          <Avatar src={thumbnailSrc} alt={name} size={AVATAR_SIZE} shape="square" className="shrink-0" />
          {/* Rich layout invariant(2026-04-23 user 校準):
              - content col minHeight = AVATAR_SIZE(48),確保 1-line desc 時內容 ≥ avatar 高
              - `justify-between`(有 bar)/`justify-center`(無 bar):
                * 1-line desc:label 頂 + progress bar 底 **自動對齊 avatar 頂/底**
                * 無 bar:content 垂直 center 對齊 avatar 中
              - `gap-2`:desc ↔ progress bar **至少 8px gap**(multi-line desc 時 bar 溢出仍保 8px)
              - row `items-start`:avatar top-align 作視覺引導(tight-stack box 內 item 邊界) */}
          <div
            className={cn(
              'flex flex-col flex-1 min-w-0 gap-2',
              progressBar ? 'justify-between' : 'justify-center',
            )}
            style={{ minHeight: AVATAR_SIZE }}
          >
            {contentRow}
            {progressBar}
          </div>
        </div>
      )
    }

    // ── compact: py-2, bar absolute 底部 ──
    // 左右 padding 單一來源(SSOT):form=12px(= px-3);upload-manager=0(由面板提供 L/R)。
    // progress bar 是 absolute 定位,其 left/right 必須跟此值「同源」—— 否則 surface 一拿掉 padding,
    // bar 的 offset 沒同步就會對齊跑掉(2026-06-03 圖五 bug:原本 left/right 寫死 0.75rem 假設 px-3)。
    const compactPadX = surface === 'upload-manager' ? 0 : 12
    return (
      <div
        ref={ref}
        className={cn(
          'group/row relative flex items-start gap-2 py-2 w-full text-body leading-compact transition-colors rounded-md',
          compactStaticBg,
          hoverClass,
          className,
        )}
        style={{ paddingInline: compactPadX }}
        onClick={onClick}
        {...rowA11y}
        {...props}
      >
        <ItemPrefix>
          <Paperclip size={ICON_PX} className="shrink-0 text-fg-muted" aria-hidden />
        </ItemPrefix>
        {/* Compact 共用 contentRow(via ItemContent primitive SSOT)—— 先前 inline
            hand-craft 導致 compact label↔desc gap 跟 rich 不同步。shared contentRow
            保證兩 mode 修 primitive 一處全同步。 */}
        <div className="flex flex-col flex-1 min-w-0">
          {contentRow}
        </div>

        {/* ProgressBar: absolute 底部。left/right 與 compactPadX 同源:
            left = padX + icon + gap-2(0.5rem)對齊 label 首字;right = padX 收在 row 內緣。 */}
        {progressBar && (
          <div
            className="absolute bottom-0"
            style={{ left: `calc(${compactPadX}px + ${ICON_PX}px + 0.5rem)`, right: compactPadX }}
          >
            {progressBar}
          </div>
        )}
      </div>
    )
  },
)
FileItem.displayName = 'FileItem'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const fileItemMeta = {
  component: 'FileItem',
  family: 2,
  variants: {

  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: ['bg-secondary', 'bg-surface'],
    fg: ['text-fg-muted', 'text-fg-secondary'],
    ring: [],
  },
} as const

export { FileItem }
