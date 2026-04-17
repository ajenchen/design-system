import * as React from 'react'
import { User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
// 直接引用 primitive（bg=step-1, text=step-7），不經過語義層
// solid：step-6 全色底 + 白色前景（yellow 例外用 --warning-foreground）
// neutral solid：neutral-9 + --inverse-fg（自動反轉）
type ColorKey = 'neutral' | 'blue' | 'red' | 'green' | 'yellow' | 'turquoise' | 'purple' | 'magenta' | 'indigo'
type VariantKey = 'subtle' | 'solid'

const COLOR_MAP: Record<VariantKey, Record<ColorKey, { bg: string; text: string }>> = {
  subtle: {
    neutral:   { bg: 'var(--muted)',                text: 'var(--foreground)' },
    blue:      { bg: 'var(--color-blue-1)',         text: 'var(--color-blue-7)' },
    red:       { bg: 'var(--color-deep-orange-1)',  text: 'var(--color-deep-orange-7)' },
    green:     { bg: 'var(--color-green-1)',        text: 'var(--color-green-7)' },
    yellow:    { bg: 'var(--color-yellow-1)',       text: 'var(--color-yellow-7)' },
    turquoise: { bg: 'var(--color-turquoise-1)',    text: 'var(--color-turquoise-7)' },
    purple:    { bg: 'var(--color-purple-1)',       text: 'var(--color-purple-7)' },
    magenta:   { bg: 'var(--color-magenta-1)',      text: 'var(--color-magenta-7)' },
    indigo:    { bg: 'var(--color-indigo-1)',       text: 'var(--color-indigo-7)' },
  },
  solid: {
    neutral:   { bg: 'var(--color-neutral-9)',      text: 'var(--inverse-fg)' },
    blue:      { bg: 'var(--color-blue-6)',         text: '#fff' },
    red:       { bg: 'var(--color-deep-orange-6)',  text: '#fff' },
    green:     { bg: 'var(--color-green-6)',        text: '#fff' },
    yellow:    { bg: 'var(--color-yellow-6)',       text: 'var(--warning-foreground)' },
    turquoise: { bg: 'var(--color-turquoise-6)',    text: '#fff' },
    purple:    { bg: 'var(--color-purple-6)',       text: '#fff' },
    magenta:   { bg: 'var(--color-magenta-6)',      text: '#fff' },
    indigo:    { bg: 'var(--color-indigo-6)',       text: '#fff' },
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
  /** 深底白字模式（step-6 背景 + 白色前景，warning 例外），預設 false */
  solid?: boolean
  /** 在線狀態指示器，顯示在 avatar 右下角 */
  status?: 'available' | 'away' | 'busy' | 'offline'
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ size = 32, shape = 'circle', src, alt, icon: Icon, color = 'neutral', solid = false, status, className, style, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false)
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

    // Status dot 尺寸：avatar 的 25%，最小 8px 最大 14px
    const dotSize = isFill ? 10 : Math.max(8, Math.min(14, Math.round(numSize * 0.25)))
    const dotBorder = dotSize >= 12 ? 3 : 2

    const STATUS_DOT_COLOR: Record<string, string> = {
      available: 'var(--success)',
      away: 'var(--warning)',
      busy: 'var(--error)',
      offline: 'var(--fg-muted)',
    }

    const avatarEl = (
      <div
        className={cn(
          'inline-flex items-center justify-center shrink-0 overflow-hidden select-none',
          isFill && 'w-full h-full',
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

    if (!status) {
      return <div ref={ref} className={cn('inline-flex shrink-0', className)} style={style} {...props}>{avatarEl}</div>
    }

    return (
      <div ref={ref} className={cn('relative inline-flex shrink-0', className)} style={style} {...props}>
        {avatarEl}
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
          aria-label={status}
        />
      </div>
    )
  }
)
Avatar.displayName = 'Avatar'

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
}

export { Avatar }
