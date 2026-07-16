/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Alert / Toast wrap 消費,end-user app 請用 wrapper 元件。
 */
import * as React from 'react'
import { X as XIcon, Info, CircleCheck, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { ICON_SIZE, ItemContent, ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * Notice — Toast / Alert 共用的視覺佈局層
 *
 * ── Typography: Family 2 reading-md(2026-06-15 user 拍板,off-grid 偏移收斂)──
 * title: text-body (14px) default leading 1.5 — 有 description 時加 font-medium
 * description: text-body (14px) default leading 1.5 + text-fg-secondary (neutral-8)
 * 14px 配 14px — 視覺層級靠 font-weight + color 區分,不靠 font-size。
 * **行高 = reading 預設 1.5**(非 compact):Notice 是 Family 2 reading consumer,
 * ItemContent 預設 mode='reading' + gap token `--item-gap-label-desc-reading` 名實相符。
 * 原 `leading-compact`(1.3)= reading-gap + scanning-行高 混搭的 off-grid 偏移,已移除。
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
  // 2026-06-15 user 拍板:Notice = 乾淨 Family 2 reading-md consumer。
  // 原 `leading-compact`(1.3)是 off-grid 偏移(reading gap token + scanning 行高混搭、未文件化),
  // 已移除 → label/desc 走 text-body reading 預設 1.5,與 ItemContent 預設 mode='reading' + gap
  // token `--item-gap-label-desc-reading` 名實相符。詳 notice.spec.md「Typography」段。
  'text-body',
  'px-4 py-3',
].join(' ')

export interface NoticeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: NoticeVariant
  title: React.ReactNode
  description?: React.ReactNode
  endContent?: React.ReactNode
  /**
   * 顯示關閉鈕(預設 true)。**需同時傳 `onDismiss` 才會渲染 X** — Notice 是 controlled-only
   * (不自我移除),無 handler 的 X 是可 focus、SR 播報「關閉通知」但按下零反應的死按鈕
   * (2026-07-05 D4;對齊 Polaris Banner `onDismiss` 存在才顯示 X / Ant Alert `closable` 預設 false)。
   */
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
      // 不 destructure-default(保留「顯式傳 true」的可辨識性給下方 dev-warn);等效預設 true 由
      // showDismiss 的 `!== false` 承擔。
      dismissible,
      onDismiss,
      dismissAriaLabel = '關閉通知', // i18n-allow: DS default; consumer override via dismissAriaLabel prop
      iconClassName,
      className,
      ...props
    },
    ref,
  ) => {
    const StatusIcon = VARIANT_ICON[variant]

    // 2026-07-05 D4:X 渲染條件 = dismissible(預設 true)**且**有傳 onDismiss — 原 `dismissible &&`
    // 單獨判斷讓預設用法 <Alert title="…"/> 渲染一顆死 X(controlled-only 不自我移除,onClick=undefined
    // 零反應;keyboard / SR 使用者按 Enter 零回饋 = 假 affordance)。對齊 Polaris Banner(onDismiss
    // 存在才顯示 X)/ Ant Alert(closable 預設 false)。
    const showDismiss = dismissible !== false && onDismiss != null
    if (process.env.NODE_ENV !== 'production' && dismissible === true && onDismiss == null) {
      // 只在「顯式傳 dismissible={true} 卻沒接 onDismiss」的消費端矛盾時提示(預設 undefined 不吵)
      console.warn('[Notice] dismissible=true 但未傳 onDismiss,關閉鈕不會渲染(需同時提供 onDismiss)。')
    }

    return (
      <div
        ref={ref}
        className={cn(NOTICE_LAYOUT, className)}
        {...props}
      >
        {StatusIcon && (
          <ItemPrefix>
            <StatusIcon size={ICON_SIZE.md} className={cn('shrink-0', iconClassName)} aria-hidden />
          </ItemPrefix>
        )}

        {/* Title + description 消費 ItemContent primitive(SSOT)。
            Label 有 desc 時 font-medium(Notice idiom:title 跟 desc 對照時 title 要更重)。 */}
        <ItemContent
          label={title}
          description={description}
          labelClassName={description ? 'font-medium' : undefined}
        />

        {(endContent || showDismiss) && (
          // 2026-06-15 user 拍板:消費 ItemSuffix primitive(原手刻 div + @row-slot-handcraft-allow
          // 已移除)。item-anatomy.spec.md 把 Notice 的 action/dismiss 對應到 suffix slot;ItemSuffix
          // base geometry(h-[1lh] shrink-0 ml-auto flex items-center gap-2)正是此處所需,hoverReveal
          // 預設 false 故無 row inline-action 機制干擾。內裝 dismiss = Button iconOnly dismiss xs(banner
          // family canonical,overlay-surface.spec.md「Chrome dismiss size canonical」)。
          <ItemSuffix>
            {endContent}
            {showDismiss && (
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
          </ItemSuffix>
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
// 2026-07-16 dim 78/DA3:variants 補齊 — 對齊 notice.spec.md frontmatter 5 variants(SSOT)
// + alertMeta `{ purpose }` idiom(Alert 是 Notice 直接 consumer,同 5-variant 語意)。
// variant 語意 = status icon 選擇(per spec「Variant」表);色彩由消費者 data-theme 控制。
export const noticeMeta = {
  component: 'Notice',
  family: 2, // Family 2（List item layout）消費者 — 對齊 notice.spec.md frontmatter family: 2 + body「Layout Family」段
  variants: {
    neutral: { purpose: '一般訊息、系統公告;無情緒色、不掛 status icon(title-only icon-less 形態)' },
    info: { purpose: '資訊提示(版本更新、流程說明);Info icon' },
    success: { purpose: '操作成功確認;CircleCheck icon' },
    warning: { purpose: '可恢復警告(未儲存變更、連線不穩);TriangleAlert icon' },
    error: { purpose: '錯誤(操作失敗、權限不足);XCircle icon' },
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
