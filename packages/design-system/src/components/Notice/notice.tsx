/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Alert / Toast wrap 消費,end-user app 請用 wrapper 元件。
 */
import * as React from 'react'
import { X as XIcon, Info, CircleCheck, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { ItemContent, ItemPrefix } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * Notice — Toast / Alert 共用的視覺佈局層
 *
 * ── Typography: md tier ──
 * title: text-body (14px) leading-compact — 有 description 時加 font-medium
 * description: text-body (14px) leading-compact + text-fg-secondary (neutral-8)
 * 14px 配 14px — 視覺層級靠 font-weight + color 區分,不靠 font-size。
 *
 * ── Padding（固定,不隨 density 變） ──
 * px = px-4（16px）
 * py = py-3（12px）
 * gap = gap-2（8px）
 * Toast/Alert 是浮動通知,不是工作區域元件——density 控制表單/選單的緊湊度,
 * 通知的尺寸應該固定,不隨 density 縮放。
 *
 * ── Icon: md tier ──
 * icon size: 16px（ICON_SIZE.md）
 *
 * ── Dismiss X(chrome corner close,Cat 3 Action group region)──
 * 用 Button iconOnly dismiss **size="xs"** — 非 Inline Action、非自刻 button。
 * Rationale(Notification banner family canonical):
 * - Notice / Alert / Toast 屬 **notification banner family**(ephemeral、px-4 py-3 固定不隨 density),
 *   dismiss 是邊角小 affordance,xs 視覺不搶眼不跟 content 競爭。見 `overlay-surface.spec.md`
 *   「Chrome dismiss size canonical」(overlay header 走 sm native + 負 margin trick;xs 只用於 notification banner family)
 * - Close 左側可加 refresh / share(action group region),皆統一 xs
 * - `dismiss` prop 自動套 variant="text" + fg-muted override
 * SSOT:patterns/element-anatomy/inline-action.spec.md「Dismiss canonical — X close only」
 *      + components/Alert/alert.spec.md「Chrome corner close X canonical」。
 */

export type NoticeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error'

const VARIANT_ICON: Record<NoticeVariant, LucideIcon | null> = {
  neutral: null,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: XCircle,
}

export const SUBTLE_ICON_COLOR: Record<NoticeVariant, string> = {
  neutral: 'text-fg-muted',
  info: 'text-info-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  error: 'text-error-text',
}

const NOTICE_LAYOUT = [
  'flex items-start gap-2 w-full',
  'text-body leading-compact',
  'px-4 py-3',
].join(' ')

export interface NoticeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: NoticeVariant
  title: React.ReactNode
  description?: React.ReactNode
  endContent?: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  /** ARIA label for the dismiss button. Override for i18n. Default: "關閉通知" */
  dismissAriaLabel?: string
  iconClassName?: string
  /**
   * ARIA role 由 wrapping consumer 決定(Alert / Toast / 自管 host),Notice 預設不帶 role。
   * Notice 是 layout primitive,Alert / Toast 是 live region 擁有者——避免 nested live region
   * 造成 screen reader 重複朗讀。明文傳遞才覆寫。
   */
  role?: 'status' | 'alert'
  /**
   * 對應 role 的 aria-live 策略,wrapping consumer 決定;Notice 預設 undefined 不帶 live region。
   */
  'aria-live'?: 'polite' | 'assertive' | 'off'
}

const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  (
    {
      variant = 'neutral',
      title,
      description,
      endContent,
      dismissible = true,
      onDismiss,
      dismissAriaLabel = '關閉通知', // i18n-allow: DS default; consumer override via dismissAriaLabel prop
      iconClassName,
      className,
      ...props
    },
    ref,
  ) => {
    const StatusIcon = VARIANT_ICON[variant]

    return (
      <div
        ref={ref}
        className={cn(NOTICE_LAYOUT, className)}
        {...props}
      >
        {StatusIcon && (
          <ItemPrefix>
            <StatusIcon size={16} className={cn('shrink-0', iconClassName)} aria-hidden />
          </ItemPrefix>
        )}

        {/* Title + description 消費 ItemContent primitive(SSOT)。
            Label 有 desc 時 font-medium(Notice idiom:title 跟 desc 對照時 title 要更重)。 */}
        <ItemContent
          label={title}
          description={description}
          labelClassName={description ? 'font-medium' : undefined}
        />

        {(endContent || dismissible) && (
          // @row-slot-handcraft-allow: Notice 是非-row alert（非 item-anatomy row），此 end slot 是 Notice 自身 layout 的 dismiss/endContent 容器，不是 row prefix/suffix → 不消費 ItemPrefix/ItemSuffix
          <div className="flex items-center gap-2 shrink-0 h-[1lh]">
            {endContent}
            {dismissible && (
              <Button
                data-dismiss
                iconOnly
                dismiss
                size="xs"
                startIcon={XIcon}
                aria-label={dismissAriaLabel}
                onClick={onDismiss}
              />
            )}
          </div>
        )}
      </div>
    )
  },
)
Notice.displayName = 'Notice'

// Singleton MutationObserver + subscription fan-out(2026-04-22 D3 perf audit):
// 先前每個 useInverseTheme consumer(Alert / Toast / Notice instance 等)各建一個 MO,
// N 個 Notice = N 個 observers。singleton 共用一個 MO + pub/sub 讓 theme swap 只做一次 DOM read。
let themeObserverStarted = false
const themeSubscribers = new Set<() => void>()

function getInverseTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  const current = document.documentElement.getAttribute('data-theme') ?? 'light'
  return current === 'dark' ? 'light' : 'dark'
}

function startThemeObserver() {
  if (themeObserverStarted || typeof document === 'undefined') return
  themeObserverStarted = true
  const root = document.documentElement
  const observer = new MutationObserver(() => {
    themeSubscribers.forEach((cb) => cb())
  })
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
}

function subscribe(cb: () => void): () => void {
  startThemeObserver()
  themeSubscribers.add(cb)
  return () => themeSubscribers.delete(cb)
}

export function useInverseTheme(): 'dark' | 'light' {
  // useSyncExternalStore canonical (React 18+):單一 external source 被 N consumers 訂閱
  return React.useSyncExternalStore(subscribe, getInverseTheme, getInverseTheme)
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const noticeMeta = {
  component: 'Notice',
  family: 2, // Family 2（List item layout）消費者 — 對齊 notice.spec.md frontmatter family: 2 + body「Layout Family」段
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 無互動 layout primitive(spec「邊界案例」:不擁有 disabled;hover / focus 屬內嵌 dismiss Button)
  tokens: {
    bg: [],
    fg: ['text-error-text', 'text-fg-muted', 'text-fg-secondary', 'text-info-text', 'text-success-text', 'text-warning-text'],
    ring: [],
  },
} as const

export { Notice }
