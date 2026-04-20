import * as React from 'react'
import { Paperclip, CircleCheck, XCircle, Download, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { Progress } from '@/design-system/components/Progress/progress'

/**
 * FileItem — 檔案顯示 / 上傳進度
 *
 * Typography: 閱讀模式 — text-body (14px) 預設行高 (1.5)
 *
 * 兩種 mode（精簡 vs 完整內容呈現）:
 *
 * compact（★ default）: Paperclip 16px 在左。右側 content + bar。
 *   py = gap = 4px (gap-1)，對稱。
 *   description 只有 error 才顯示。
 *   bar 跟文字左邊對齊（在 icon 右邊的 column 內）。
 *
 * rich: Avatar 56px square 在左（顯示檔案內容縮圖）。右側 content + bar。
 *   多行 description（size / status message）。
 *   有 bar → justify-between（bar 底部對齊 avatar）
 *   無 bar → justify-center（文字垂直置中對齊 avatar）
 *
 * status 可選。不傳 = 已上傳檔案（無 bar，可點擊下載）。
 * onClick → hover:bg-neutral-hover + cursor-pointer。
 */

const STATUS_ICON = {
  completed: { icon: CircleCheck, color: 'text-success' },
  error: { icon: XCircle, color: 'text-error' },
} as const

// Progress status 映射:uploading=inProgress(藍) / completed=success(綠) / error=error(紅)
// 與 Progress 元件的 status prop 對齊,不需再維護 PROGRESS_COLOR 本地 map。
const PROGRESS_STATUS_MAP = {
  uploading: 'inProgress',
  completed: 'success',
  error: 'error',
} as const

const AVATAR_SIZE = 56
const ICON_PX = 16

export interface FileItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  name: string
  /**
   * 兩種呈現 mode（精簡 vs 完整）：
   * - `compact`（預設）：paperclip + filename 單行 inline
   * - `rich`：縮圖 + 檔名 + size + status + progress 的完整 card 呈現
   */
  mode?: 'compact' | 'rich'
  status?: 'uploading' | 'completed' | 'error'
  progress?: number
  /** rich mode: 檔案大小、狀態訊息。compact: 只有 error 才顯示。 */
  description?: string
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

const FileItem = React.forwardRef<HTMLDivElement, FileItemProps>(
  (
    {
      name,
      mode = 'compact',
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

    const hoverClass = onClick ? 'cursor-pointer hover:bg-neutral-hover' : ''

    // 消費 Progress 元件(SSOT);不再自 roll bar。rich=md(4px)/ compact=sm(2px)。
    const progressBar = hasStatus ? (
      <Progress
        value={progressWidth}
        status={PROGRESS_STATUS_MAP[status!]}
        size={isRich ? 'md' : 'sm'}
      />
    ) : null

    // suffix
    const suffixAlign = isRich && showDesc
      ? 'h-[calc(1lh+2px+var(--font-body-size)*1.5)]'
      : 'h-[1lh]'

    // Status slot 幾何:與 consumer 的 delete Button **同尺寸**
    //   rich  → Button sm(h-field-sm,density-variable 28/32)
    //   compact → Button xs(24 固定)
    // 這樣 `gap-2`(8px) 是兩個「同 size button」之間的距離,真 8px gap 不被溢出覆蓋。
    // Passive icon 16px 置中於 button-sized 容器(視覺 framing 與 hover-swap 一致)。
    const deleteBtnSize = isRich ? 'sm' : 'xs'
    const slotHw = isRich ? 'var(--field-height-sm)' : 'var(--field-height-xs)'

    const hoverAction =
      status === 'completed' && onDownload ? { icon: Download, onClick: onDownload, label: '下載' } :
      status === 'error' && onRetry        ? { icon: RotateCw, onClick: onRetry,    label: '重試' } :
      null

    const statusSlot = statusConfig ? (
      <span
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: slotHw, height: slotHw }}
      >
        {/* Passive 狀態 icon:預設可見;若有 hover-swap,row-hover 時淡出 */}
        <statusConfig.icon
          size={ICON_PX}
          className={cn(
            'shrink-0 transition-opacity',
            statusConfig.color,
            hoverAction && 'group-hover/row:opacity-0',
          )}
          aria-hidden
        />
        {/* Active action Button:row-hover 時淡入(僅 hoverAction 存在時渲染) */}
        {hoverAction && (
          <Button
            variant="text"
            size={deleteBtnSize}
            iconOnly
            startIcon={hoverAction.icon}
            aria-label={hoverAction.label}
            onClick={(e) => { e.stopPropagation(); hoverAction.onClick() }}
            className="absolute inset-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
          />
        )}
      </span>
    ) : null

    const suffix = (
      <div className={cn('flex items-center gap-2 shrink-0', suffixAlign)}>
        {status === 'uploading' && isRich && (
          <span className="text-fg-secondary tabular-nums">{progress}%</span>
        )}
        {statusSlot}
        {actions}
      </div>
    )

    // content row
    const contentRow = (
      <div className="flex items-start gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate">{name}</span>
          {showDesc && (
            <span className={cn(status === 'error' ? 'text-error-text' : 'text-fg-secondary')}>
              {description}
            </span>
          )}
        </div>
        {suffix}
      </div>
    )

    // a11y: clickable row — 行是可點互動 surface 時補 button role + keyboard。
    // 只在 consumer 傳入 onClick 時啟用,否則保持 presentational(純展示不搶焦點)。
    const rowA11y = onClick
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClick()
            }
          },
        }
      : {}

    // ── rich（含縮圖完整呈現）──
    if (isRich) {
      return (
        <div
          ref={ref}
          className={cn('group/row flex items-start gap-3 px-3 py-2 w-full text-body transition-colors', hoverClass, className)}
          onClick={onClick}
          {...rowA11y}
          {...props}
        >
          <Avatar src={thumbnailSrc} alt={name} size={AVATAR_SIZE} shape="square" className="shrink-0" />
          <div
            className={cn('flex flex-col flex-1 min-w-0', progressBar ? 'justify-between' : 'justify-center')}
            style={{ minHeight: AVATAR_SIZE }}
          >
            {contentRow}
            {progressBar}
          </div>
        </div>
      )
    }

    // ── compact: py-2 對稱, bar absolute 底部 ──
    return (
      <div
        ref={ref}
        className={cn('group/row relative flex items-start gap-2 px-3 py-2 w-full text-body transition-colors', hoverClass, className)}
        onClick={onClick}
        {...rowA11y}
        {...props}
      >
        <span className="h-[1lh] shrink-0 flex items-center">
          <Paperclip size={ICON_PX} className="shrink-0 text-fg-muted" aria-hidden />
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate">{name}</span>
              {showDesc && (
                <span className="text-error-text">
                  {description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 h-[1lh]">
              {statusSlot}
              {actions}
            </div>
          </div>
        </div>

        {/* Progress bar: absolute 底部, left 對齊 label（跳過 icon + gap） */}
        {progressBar && (
          <div className="absolute bottom-0 right-3" style={{ left: `calc(0.75rem + ${ICON_PX}px + 0.5rem)` }}>
            {progressBar}
          </div>
        )}
      </div>
    )
  },
)
FileItem.displayName = 'FileItem'

export { FileItem }
