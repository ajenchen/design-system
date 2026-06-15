// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CAT_SUBTLE_TOKENS, CAT_SOLID_TOKENS, type CategoricalColor } from '@/design-system/tokens/categorical-color'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/design-system/components/HoverCard/hover-card'
import { HOVER_DELAY_RICH_MS, HOVER_DELAY_CLOSE_MS } from '@/design-system/tokens/motion/motion'
import { Badge } from '@/design-system/components/Badge/badge'
import { useResolvedFieldDisabled, useTableIsScrolling } from '@/design-system/components/Field/field-context'

/**
 * Avatar — 頭像元件
 *
 * 三種內容模式（按優先順序）：
 *   1. src → 圖片
 *   2. icon → icon 在底色圓/方形內
 *   3. alt → 取首字作文字 fallback
 *   4. 都沒有 → 預設 User icon
 *
 * ── 尺寸 ──
 *   size 接受任意 px 值，icon 自動 = round_even(size × 0.6)
 *   文字 fallback 字體 = size × 0.5
 *
 * ── 形狀 ──
 *   circle（預設）→ rounded-full，用於人物
 *   square → rounded-md (4px)，用於實體（專案、組織、App）
 */

// ── 色彩 ──
// **消費 categorical-color SSOT**(CAT_SUBTLE_TOKENS / CAT_SOLID_TOKENS,key X 一律對 `--color-X-*`,
// 1:1 零 offset)。subtle=step-1 底 + step-7 字;solid=step-6 全色底 + on-emphasis 字
//(亮 hue yellow/amber/orange/lime 用 --on-emphasis-dark 深字;green 白字例外)。neutral 非色相,自處理(subtle=muted、solid=neutral-9)。
// 2026-06-04 修:原 `red` 誤接 `--color-deep-orange-*`(red=品牌紅 hue-25 ≠ deep-orange);
// 改消費 SSOT 後 red→`--color-red-*`,並補齊全 12 色相。
type ColorKey = CategoricalColor
type VariantKey = 'subtle' | 'solid'

const COLOR_MAP: Record<VariantKey, Record<ColorKey, { bg: string; text: string }>> = {
  subtle: {
    neutral: { bg: 'var(--muted)', text: 'var(--foreground)' },
    ...CAT_SUBTLE_TOKENS,
  },
  solid: {
    neutral: { bg: 'var(--color-neutral-9)', text: 'var(--inverse-fg)' },
    ...CAT_SOLID_TOKENS,
  },
}

// ── Icon size: round to nearest even, ≈ 60% ──
function getIconSize(avatarSize: number): number {
  return Math.round((avatarSize * 0.6) / 2) * 2
}

// ── Text fallback: first character ──
function getInitial(text: string): string {
  return text.trim().charAt(0).toUpperCase()
}

// Semantic presence tokens — 見 color/semantic.css
// Module-level constant(2026-04-22 D3 perf audit):從 render body 移到 module scope,
// 避免每次 Avatar render 都 re-declare 此 4-entry object(Low impact 但渲染大量 avatars 時累積可觀)
const STATUS_DOT_COLOR: Record<string, string> = {
  online: 'var(--status-online)',
  away: 'var(--status-away)',
  busy: 'var(--status-busy)',
  offline: 'var(--status-offline)',
}

// ── useDocumentTheme(2026-04-23;M3 Portal 逃脫防線,scope verified 2026-04-25)──
// 讀 `<html data-theme>` 並 observe mutation。用於 Avatar hoverCard ProfileCard:
// Portal 後的 HoverCardContent 會繼承 trigger subtree theme(如 OverflowIndicator
// dark tooltip 內部),造成 ProfileCard 被污染成 dark。顯式 bind app-level theme
// 確保 ProfileCard 永遠跟 app 本身 theme 一致(light-in-light-app / dark-in-dark-app)。
//
// 範圍 audit 2026-04-25:觀察對象是 `document.documentElement` 自有 DOM,非 3rd-party
// lib 內部(不屬 M2 scope);attributeFilter 限定 `data-theme` 單一 attr,re-render 成本
// 為每次全站 theme 切換 × Avatar 數量,可接受。
function useDocumentTheme(): string | null {
  const [theme, setTheme] = React.useState<string | null>(() =>
    typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null,
  )
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const update = () => setTheme(root.getAttribute('data-theme'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

// ── Component ──

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 尺寸：number (px) 或 'fill'（填滿父容器，由父層決定大小）。預設 32 */
  size?: number | 'fill'
  /** 形狀：circle（人物）或 square（實體），預設 circle */
  shape?: 'circle' | 'square'
  /** 圖片 URL */
  src?: string
  /** 替代文字（圖片失敗時取首字作 fallback） */
  alt?: string
  /** Icon 模式（LucideIcon） */
  icon?: LucideIcon
  /** Icon / text fallback 的背景色，預設 neutral */
  color?: ColorKey
  /** 深底模式（step-6 背景 + on-emphasis 配對前景；亮色 hue yellow/amber/orange/lime 用深字 --on-emphasis-dark），預設 false */
  solid?: boolean
  /**
   * 在線狀態指示器(presence),顯示在 avatar **右下角**。
   * 世界級對照:Slack / Teams / Discord — `online` 是最廣泛被理解的術語。
   * 位置語義:右下 = "此人的 presence"(使用者聚焦於「這個人是誰 + 現在 在不在」)。
   */
  status?: 'online' | 'away' | 'busy' | 'offline'
  /**
   * 未讀 / 通知計數 badge,顯示在 avatar **右上角**。
   * 世界級對照:chat app(iMessage / Slack thread / LINE / WhatsApp)一律右上角。
   * 位置語義:右上 = "關於此對話的新事件數量"(使用者聚焦於「有多少未處理」);
   * 與右下的 presence 共存不衝突(不同角、不同語義)。
   * `> 99` 自動顯示 "99+"(交給內部 Badge 的 `max` 行為)。
   */
  badgeCount?: number
  /**
   * 傳入 HoverCard 內容（如 ProfileCard），hover avatar 時自動顯示。
   * 只有人員 avatar 需要傳；實體 avatar（專案、組織）不傳。
   */
  hoverCard?: React.ReactNode
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
// 2026-05-13 (a) perf fix part-2(per codex Layer C Roadmap rich-cell dominant + user 拍 Path (a)):
// `React.memo` wrap forwardRef Avatar — Roadmap 13 columns 含 person/multiPerson,每 row 多 avatar
// × HoverCard subtree + useDocumentTheme observer = 重渲染 hotspot。memo shallow-equal props,
// HoverCard / themeRef stable across scroll 時 skip re-render。對齊 codex Profile Plan step 5
// (filter Avatar/PeoplePicker/FieldSurfaceProvider remounts)。
// code-quality-allow: long-function — size × shape × color × solid × status × badgeCount × hoverCard × img-fallback 多軸 prop 組合,拆 sub-fn 會跨 fn 傳 imgError state + isTableScrolling observer 結果
const AvatarInner = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ size = 32, shape = 'circle', src, alt, icon: Icon, color = 'neutral', solid = false, status, badgeCount, hoverCard, className, style, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false)
    const documentTheme = useDocumentTheme()
    const isTableScrolling = useTableIsScrolling()
    // 2026-05-13 R3.5(per codex Q3 verdict + user 拍「想盡辦法 auto-handle prereq」):
    // Avatar self-dim when in disabled Field wrapper context(取代既有 wrapper opacity-disabled blanket
    // 逃生艙 — color.spec.md:729 specific-disabled-color canonical)。
    // Scope:`useResolvedFieldDisabled()`(= fieldCtx.disabled,涵蓋 <Field disabled> 與 <Field mode="disabled">),標準 Field
    // 家族 wrapper disabled 時才 dim;**沒包在 Field wrapper 內的 standalone Avatar**(ProfileCard / FileItem /
    // HoverCard / Dialog 等 display 場景)**backward compat 不變**。對齊 avatar.spec.md「Avatar 在 disabled
    // 元件內 host-controlled opacity」canonical — 升級成「Avatar self-managed via fieldCtx」。
    // 2026-06-08 SSOT:欄位內 Avatar 跟隨 <Field disabled>/<Field mode="disabled"> 變淡(fieldCtx-scoped,cell 無 fieldCtx → 不影響)
    const isDisabledInField = useResolvedFieldDisabled()
    const isFill = size === 'fill'
    // Fill 模式下 icon 用 60% 寬高、text 用 50cqi（container query inline-size）；
    // 數字模式下用既有 px 計算
    const numSize = isFill ? 32 : (size as number)
    const iconPx = getIconSize(numSize)
    const fontSizePx = Math.round(numSize * 0.5)
    const variantKey: VariantKey = solid ? 'solid' : 'subtle'
    const colors = COLOR_MAP[variantKey]?.[color] ?? COLOR_MAP.subtle.neutral
    const radius = shape === 'circle' ? '9999px' : '4px'

    // 決定內容
    const showImage = src && !imgError
    const showIcon = !showImage && (Icon || (!alt))
    const showText = !showImage && !showIcon && alt

    const FallbackIcon = Icon ?? User

    // Status dot 尺寸:avatar 的 28%(Slack / Teams / Discord 世界級平均),
    // clamp [8, 16] — floor 8 保小 avatar 仍可辨識但不喧賓奪主(10 floor 會讓 24px
    // avatar 的 dot 占 42% 太大);ceiling 16 防大 avatar dot 過度放大
    const dotSize = isFill ? 10 : Math.max(8, Math.min(16, Math.round(numSize * 0.28)))
    // Border ring 在 surface 上分離 dot 與 avatar,dotSize ≥ 12 時升階到 3px 保持視覺比例
    const dotBorder = dotSize >= 12 ? 3 : 2

    const avatarEl = (
      <div
        className={cn(
          'inline-flex items-center justify-center shrink-0 overflow-hidden select-none',
          isFill && 'w-full h-full',
          // 2026-05-13 R3.5 self-dim:Avatar 在 disabled Field wrapper context 內自 dim
          // (取代 field-wrapper.tsx default/bare/naked disabled blanket opacity-disabled 逃生艙)
          isDisabledInField && 'opacity-disabled',
        )}
        style={{
          ...(isFill
            ? { containerType: 'inline-size' as React.CSSProperties['containerType'] }
            : { width: numSize, height: numSize }),
          borderRadius: radius,
          backgroundColor: showImage ? undefined : colors.bg,
          color: showImage ? undefined : colors.text,
        }}
        data-avatar-size={isFill ? 'fill' : numSize}
        role={!showImage && alt && !hoverCard ? 'img' : undefined}
        aria-label={!showImage && alt && !hoverCard ? alt : undefined}
      >
        {showImage && (
          <img
            src={src}
            alt={alt ?? ''}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
        {showIcon && (
          isFill
            ? <FallbackIcon className="w-[60%] h-[60%]" aria-hidden />
            : <FallbackIcon size={iconPx} aria-hidden />
        )}
        {showText && (
          <span
            className="font-medium leading-none"
            style={{ fontSize: isFill ? '50cqi' : fontSizePx }}
            aria-hidden
          >
            {getInitial(alt!)}
          </span>
        )}
      </div>
    )

    const hasOverlay = status || typeof badgeCount === 'number'
    // Keyboard access canonical(D4 UX audit 2026-04-22 finding):Avatar with `hoverCard`
    // 需 keyboard 可達 — Radix `HoverCardTrigger asChild` 不自動加 tabIndex,non-focusable
    // `<div>` 會讓 keyboard-only user 無法 reach ProfileCard popover(WCAG 2.1.1 / 4.1.2 違反)。
    // 解:當 `hoverCard` 存在時,wrapper `<div>` 變 focusable(`tabIndex=0` + `role="button"` +
    // `aria-haspopup="dialog"` + focus-visible ring)。若無 hoverCard 則維持純展示 `<div>`。
    const focusableProps = hoverCard
      ? {
          tabIndex: 0,
          role: 'button' as const,
          'aria-haspopup': 'dialog' as const,
          'aria-label': alt ?? 'View profile',
        }
      : {}
    // 2026-05-31:focus ring 圓角跟隨 shape(circle→rounded-full / square→rounded-md,對齊 body 的 `radius` 變數 '9999px'/'4px'),
    // 原寫死 rounded-full 會讓方形 avatar(實體)配 hoverCard 時出現圓形 ring。hoverCard 為通用行為(任意內容),
    // 方形 avatar 合法可配(內容非 ProfileCard 而已),故 ring 必跟形狀。
    const focusableClass = hoverCard
      ? cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1', shape === 'circle' ? 'rounded-full' : 'rounded-md')
      : ''
    const baseEl = !hasOverlay
      ? <div ref={ref} className={cn('inline-flex shrink-0', focusableClass, className)} style={style} {...focusableProps} {...props}>{avatarEl}</div>
      : (
        <div ref={ref} className={cn('relative inline-flex shrink-0', focusableClass, className)} style={style} {...focusableProps} {...props}>
          {avatarEl}
          {/* Status dot:bottom-right(presence — 世界級對照 Slack / Teams / Discord),
              落在 circle avatar 圓周 45° 位置 / square avatar 右下直角;
              border ring 用 surface 色讓 dot 從 avatar 邊界視覺分離。
              a11y:`aria-hidden` — presence 資訊整合到 parent avatar 的 aria-label
              (world-class Slack 做法),避免多 `role="status"` 造成 screen reader 洪水 */}
          {status && (
            <span
              className="absolute block rounded-full"
              style={{
                width: dotSize,
                height: dotSize,
                bottom: 0,
                right: 0,
                backgroundColor: STATUS_DOT_COLOR[status],
                boxShadow: `0 0 0 ${dotBorder}px var(--surface-raised, var(--canvas))`,
              }}
              aria-hidden
            />
          )}
          {/* Count badge:top-right(chat 未讀 / 通知計數 — 世界級對照 iMessage /
              Slack thread / LINE / WhatsApp)。消費 DS Badge(critical variant),
              再加 ring 與 avatar 分離 */}
          {typeof badgeCount === 'number' && badgeCount > 0 && (
            <Badge
              variant="critical"
              count={badgeCount}
              max={99}
              className="absolute -top-1 -right-1"
              style={{
                boxShadow: `0 0 0 2px var(--surface-raised, var(--canvas))`,
              }}
              aria-label={`${badgeCount} unread`}
            />
          )}
        </div>
      )

    // 2026-05-13 (c) scroll-defer perf(per user 拍 Path (c) + codex Q3 verdict):
    // DataTable scrolling 期間跳 HoverCard wrapper(Portal + useDocumentTheme observer 是
    // Roadmap 重渲 hotspot,per codex Layer C 分析)。scroll 結束 → context flips false →
    // re-render 接回完整 HoverCard tree(ProfileCard 仍可 hover 顯示)。
    // 對齊 AG Grid `deferRender` for slow React cell components / MUI X DataGrid scroll-defer。
    if (!hoverCard || isTableScrolling) return baseEl

    return (
      <HoverCard openDelay={HOVER_DELAY_RICH_MS} closeDelay={HOVER_DELAY_CLOSE_MS}>
        <HoverCardTrigger asChild>
          {baseEl}
        </HoverCardTrigger>
        {/* HoverCardContent canonical(2026-04-23):
            - 無 inner padding(consumer ProfileCard 自帶 `px-4 py-3` chrome)
            - `overflow-hidden` + `rounded-lg` → child(ProfileCard)圓角裁切
            - **不設 max-height**:ProfileCard 自己消費 `--radix-hover-card-content-available-height`
              自約束高度 + 內部 ScrollArea 處理捲動
            - `data-theme={documentTheme}`:ProfileCard 永遠跟隨 **app-level theme**(從 `<html data-theme>`
              動態讀),不受 trigger subtree theme 污染。範例:Avatar 位於 OverflowIndicator 的 dark
              tooltip 內,其 Portal 會繼承該 subtree dark theme → ProfileCard 變全黑。顯式設回 app theme
              確保 ProfileCard 永遠 light-in-light-app / dark-in-dark-app。 */}
        <HoverCardContent
          data-theme={documentTheme ?? undefined}
          className="bg-surface-raised rounded-lg border border-border overflow-hidden"
          style={{ boxShadow: 'var(--elevation-200)' }}
        >
          {hoverCard}
        </HoverCardContent>
      </HoverCard>
    )
  }
)
AvatarInner.displayName = 'AvatarInner'

// ── AvatarData ─────────────────────────────────────────────────────────────
// 資料型別，讓 consumer 傳資料而非 ReactNode。
// 接收端內部用 Avatar 元件渲染，統一控制尺寸與 fallback。

export interface AvatarData {
  /** 圖片 URL */
  src?: string
  /** 替代文字（圖片失敗時取首字作 fallback） */
  alt: string
  /** Icon / text fallback 的背景色，預設 neutral */
  color?: ColorKey
  /**
   * Person avatar hover ProfileCard(DS-wide canonical,person avatar 預設必有,見 avatar.spec.md)。
   * Entity avatar(專案 / 組織 logo)不帶 → consumer 不傳 hoverCard 即豁免。
   * 所有消費 AvatarData 的 primitive(MenuItem / DropdownMenu / SelectMenu / SelectionItem / ProfileCard)
   * 需 forward 此 prop 到內部 <Avatar hoverCard={avatar.hoverCard} />。
   */
  hoverCard?: React.ReactNode
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const avatarMeta = {
  component: 'Avatar',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'focus-visible', 'disabled'], // 2026-06-11 R2:本身無自有 hover/active(spec L279;hoverCard 互動屬 HoverCard),
  tokens: {
    bg: ['bg-surface-raised'],
    fg: ['--foreground', '--on-emphasis'],
    ring: ['ring-ring'],
  },
} as const

AvatarInner.displayName = 'Avatar'
const Avatar = React.memo(AvatarInner)

export { Avatar }
