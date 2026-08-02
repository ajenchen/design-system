import * as React from 'react'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import { Notice, useInverseTheme, type NoticeVariant } from '@/design-system/components/Notice/notice'
import { Button } from '@/design-system/components/Button/button'

/**
 * Toast — 非阻斷式浮動通知
 *
 * ── Container 三層結構（所有 variant 統一） ──
 *
 * 1. Shadow wrapper: rounded-lg + elevation-200（永遠在頁面 theme 解析）
 * 2. Bg layer: bg-{color}（有色相 variant 在頁面 theme 解析）
 * 3. Theme layer: data-theme + text-foreground（content token re-resolve）
 *
 * neutral/success(inverse): bg + theme 同層（bg-surface-raised 需要跟 data-theme 一起翻轉）
 * info/error(dark): bg 在 outer,theme 在 inner
 * warning(light always): bg 在 outer,theme="light" 在 inner
 */

// code-quality-allow: dead-export — public API surface — consumer-exposed for future use
export type ToastVariant = NoticeVariant

export interface ToastOptions {
  variant?: ToastVariant
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

type ToastAnnouncement = {
  level: 'polite' | 'assertive'
  message: string
  sequence: number
}

type ToastAnnouncementListener = (announcement: ToastAnnouncement) => void

const toastAnnouncementListeners = new Set<ToastAnnouncementListener>()
let toastAnnouncementSequence = 0

function subscribeToToastAnnouncements(listener: ToastAnnouncementListener) {
  toastAnnouncementListeners.add(listener)
  return () => {
    toastAnnouncementListeners.delete(listener)
  }
}

function publishToastAnnouncement(options: ToastOptions) {
  const isCritical = options.variant === 'error' || options.variant === 'warning'
  const announcement: ToastAnnouncement = {
    level: isCritical ? 'assertive' : 'polite',
    message: [options.title, options.description].filter(Boolean).join('。'),
    sequence: ++toastAnnouncementSequence,
  }

  toastAnnouncementListeners.forEach((listener) => listener(announcement))
}

function ToastLiveRegions() {
  const politeRef = React.useRef<HTMLDivElement>(null)
  const assertiveRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => subscribeToToastAnnouncements((announcement) => {
    const region = announcement.level === 'assertive' ? assertiveRef.current : politeRef.current
    if (!region) return

    // Replace the text node instead of assigning the same React string again. That guarantees an
    // observable child-list mutation even when two consecutive toasts have identical copy.
    region.dataset.announcementSequence = String(announcement.sequence)
    region.replaceChildren(region.ownerDocument.createTextNode(announcement.message))
  }), [])

  return (
    <>
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-toast-live-region="polite"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-toast-live-region="assertive"
        className="sr-only"
      />
    </>
  )
}

function ToastInner({
  id,
  variant = 'neutral',
  action,
  ...rest
}: ToastOptions & { id: string | number }) {
  const inverseTheme = useInverseTheme()
  const isInverse = variant === 'neutral' || variant === 'success'
  const dismiss = () => sonnerToast.dismiss(id)

  // action 執行後自動 dismiss:關閉「復原/重試」的重複觸發窗口(double-undo / double-retry),
  // 對齊 Polaris Toast action / Material Snackbar action 按後即收慣例;
  // toast.anatomy.stories.tsx「點 action button 執行 callback + 關閉 toast」宣稱自此為真。
  const actionButton = action ? (
    <Button variant="tertiary" size="xs" onClick={() => { action.onClick(); dismiss() }}>{action.label}</Button>
  ) : undefined

  // Sonner 2.0.7 owns a fixed aria-live="polite" section around every visual toast and does not
  // expose an override. Mark our custom visual subtree as non-live so it remains readable/focusable
  // through Sonner's tabIndex=0 toast + ⌥T hotkey without becoming a nested live region. The two
  // stable sibling regions rendered by <Toaster> own announcements and severity routing.
  const visualA11yProps = {
    role: 'group',
    'aria-live': 'off',
    'data-toast-visual-content': '',
  } as const

  // ── 1. Shadow wrapper（統一,永遠在頁面 theme） ──
  // ── 2+3. Bg + theme layer ──

  if (isInverse) {
    // bg-surface-raised 需要跟 data-theme 同層翻轉
    return (
      <div {...visualA11yProps} className="rounded-lg overflow-hidden" style={{ boxShadow: 'var(--elevation-200)' }}>
        <div data-theme={inverseTheme} className="bg-surface-raised text-foreground">
          <Notice variant={variant} iconClassName={variant === 'success' ? 'text-success' : undefined}
            endContent={actionButton} onDismiss={dismiss} {...rest} />
        </div>
      </div>
    )
  }

  const bg = variant === 'warning' ? 'bg-warning' : variant === 'error' ? 'bg-error' : 'bg-info'
  const theme = variant === 'warning' ? 'light' : 'dark'

  return (
    <div {...visualA11yProps} className="rounded-lg overflow-hidden" style={{ boxShadow: 'var(--elevation-200)' }}>
      <div className={bg}>
        <div data-theme={theme} className="text-foreground">
          <Notice variant={variant} endContent={actionButton} onDismiss={dismiss} {...rest} />
        </div>
      </div>
    </div>
  )
}

export function toast(options: ToastOptions) {
  // 2026-07-05 D4:sonner 計時器不因鍵盤 Tab 焦點暫停(僅 hover / pointer 按住 / ⌥T hotkey)——
  // 含 action(復原/重試)預設 10s,給鍵盤使用者足夠時間 Tab 到 action(user 拍板;對齊 Polaris toast with action ≥10s)
  const { duration = options.action ? 10000 : 4000, ...rest } = options
  const id = sonnerToast.custom((toastId) => <ToastInner id={toastId} {...rest} />, { duration })
  publishToastAnnouncement(options)
  return id
}

export interface ToasterProps {
  position?: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
}

// shadcn canonical:forwardRef + displayName 統一。SonnerToaster 不轉發 ref,
// 故 ref 無實際 DOM 節點可接;viewport 為就地渲染的 <section>,以 CSS position:fixed
// 覆蓋 viewport(非 portal — sonner 全庫 0 createPortal,2026-07-04 grep 驗證)。
// 保留 forwardRef 簽名以符合 DS 統一 API(consumer 可 typecheck 傳 ref)。
const Toaster = React.forwardRef<HTMLDivElement, ToasterProps>(
  ({ position = 'bottom-right', ...props }, _ref) => {
    return (
      <>
        <SonnerToaster
          position={position}
          toastOptions={{ unstyled: true, className: 'w-[360px]' }}
          {...props}
        />
        <ToastLiveRegions />
      </>
    )
  },
)
Toaster.displayName = 'Toaster'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const toastMeta = {
  component: 'Toast',
  family: 2, // Family 2(List item layout)— 透過 Notice 繼承,對齊 toast.spec.md frontmatter L3 + L39
  variants: {
    neutral: { when: '非狀態通知;一般 announcement / tip' },
    info: { when: '資訊性提示(新版本 / 同步完成)' },
    success: { when: '成功確認(已寄送 / 付款完成)' },
    warning: { when: '可恢復警告(未儲存 / 連線不穩)' },
    error: { when: '錯誤(匯入失敗 / 權限不足);action prop 可加重試' },
  },
  sizes: {},
  // 2026-07-04 audit 對齊:Toast 無 disabled state(spec 邊界案例明文;對齊 noticeMeta ['default'] 已修 pattern)
  states: ['default'],
  tokens: {
    bg: ['bg-error', 'bg-info', 'bg-surface-raised', 'bg-warning'],
    fg: ['text-foreground'],
    ring: [],
  },
} as const

export { Toaster }
