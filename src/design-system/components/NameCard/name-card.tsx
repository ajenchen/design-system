import * as React from 'react'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'

/**
 * NameCard — 人員 HoverCard 的內容元件
 *
 * 放在 HoverCardContent 內使用。Consumer 用 HoverCard 包 avatar/name。
 *
 * ── Padding ──
 * 用 layout-space token（px=loose, py=tight）：
 *   HoverCard（md density）→ loose=16, tight=12
 *   Modal（lg density）→ loose=24, tight=16
 *   同一個 NameCard 在不同容器自動適配。
 *
 * ── Avatar 狀態指示 ──
 * status dot 程式化在 Avatar 上（Avatar status prop），不獨立擺放。
 *
 * ── Status message ──
 * 最多 2 行（line-clamp-2）。
 *
 * ── View more ──
 * Button link 填滿容器寬度（w-full），不左對齊。
 */

const AVATAR_SIZE = 64

type StatusType = 'available' | 'away' | 'busy' | 'offline'

const STATUS_COLOR: Record<StatusType, string> = {
  available: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-error',
  offline: 'bg-fg-muted',
}

const STATUS_LABEL: Record<StatusType, string> = {
  available: 'Available',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
}

function StatusDot({ status, className }: { status: StatusType; className?: string }) {
  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', STATUS_COLOR[status], className)} />
}

export interface NameCardField {
  label: string
  value: string
}

export interface NameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  avatar?: AvatarData
  subtitle?: string
  status?: StatusType
  statusMessage?: React.ReactNode
  actions?: React.ReactNode
  fields?: NameCardField[]
  onViewMore?: () => void
  viewMoreLabel?: string
}

const NameCard = React.forwardRef<HTMLDivElement, NameCardProps>(
  (
    {
      name,
      avatar,
      subtitle,
      status,
      statusMessage,
      actions,
      fields,
      onViewMore,
      viewMoreLabel = 'View more',
      className,
      ...props
    },
    ref,
  ) => {
    const hasStatus = !!status
    const hasFields = fields && fields.length > 0

    return (
      <div ref={ref} className={cn('w-[320px]', className)} {...props}>
        {/* ── Profile header ── */}
        <div className="flex items-start gap-3 px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
          <Avatar
            src={avatar?.src}
            alt={avatar?.alt ?? name}
            color={avatar?.color}
            size={AVATAR_SIZE}
            status={status}
            className="shrink-0"
          />
          <div className="flex flex-col min-w-0 flex-1 pt-0.5">
            <span className="text-body-lg font-medium text-foreground">{name}</span>
            {subtitle && (
              <span className="text-body text-fg-secondary mt-0.5">{subtitle}</span>
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}
        {actions && (
          <div className="flex items-center gap-2 px-[var(--layout-space-loose)] pb-[var(--layout-space-tight)]">
            {actions}
          </div>
        )}

        {/* ── Status + message ── */}
        {hasStatus && (
          <div className="border-t border-divider px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
            <div className="flex items-center gap-1.5 text-body">
              <StatusDot status={status!} />
              <span>{STATUS_LABEL[status!]}</span>
            </div>
            {statusMessage && (
              <div className="mt-2">
                <span className="text-caption text-fg-muted">Status message</span>
                <p className="text-body mt-0.5 line-clamp-2">{statusMessage}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Info fields ── */}
        {hasFields && (
          <div className="border-t border-divider px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {fields!.map((f) => (
                <div key={f.label} className="flex flex-col">
                  <span className="text-caption text-fg-muted">{f.label}</span>
                  <span className="text-body">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── View more ── */}
        {onViewMore && (
          <div className="border-t border-divider px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
            <Button variant="link" size="sm" onClick={onViewMore} className="w-full">{viewMoreLabel}</Button>
          </div>
        )}
      </div>
    )
  },
)
NameCard.displayName = 'NameCard'

export { NameCard, StatusDot }
