import * as React from 'react'
import { MessageCircle, Phone, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * NameCardDefaultActions — canonical 預設 action 組合
 *
 * ── 為什麼需要 export ──
 * NameCard 的 action 列在世界級 chat/contact app 是「關係型快速動作」的 canonical
 * (Slack / iMessage / LinkedIn / Figma 皆如此):**Chat / Message + Audio call**。
 * 跨 consumer(avatar.principles / name-card.stories / future product code)應該用
 * 同一組預設,避免每個範例各自發明 action 組合,讓 reader 誤以為 action 會隨情境自動變。
 *
 * ── 使用方式(hover context 必含 onViewMore,見 name-card.spec.md 「View more」節)──
 *   <NameCard name="..." actions={<NameCardDefaultActions />} onViewMore={...} />
 *
 * ── 何時要換成自訂 action ──
 * - Single-action 情境(只要「傳訊息」)→ consumer 傳 `<Button>傳訊息</Button>`
 * - 特定情境的 action(管理員「撤銷邀請」/ HR「離職管理」)→ consumer 自訂
 * - 非人員關係動作(「訂購此商品」)→ 根本不應該用 NameCard
 *
 * Chat + Audio call 是 **default**,不是 **only**——consumer 可覆寫,但需有明確理由。
 */
export const NameCardDefaultActions = () => (
  <>
    <Button variant="tertiary" size="sm" startIcon={MessageCircle}>Chat</Button>
    <Button variant="tertiary" size="sm" startIcon={Phone} endIcon={ChevronDown}>Audio call</Button>
  </>
)

/**
 * NameCard — 人員 HoverCard 的內容元件
 *
 * ── Status 對齊 Avatar presence canonical(2026-04-20) ──
 * status type = `online | away | busy | offline`,跟 Avatar 的 presence prop 對齊
 * (世界級 Slack / Teams / Discord term);dot 色走 `--status-*` semantic token
 * (獨立於 success/error/warning,避免語義衝突)。
 *
 * ── Avatar 對齊 ──
 * 跟 FileItem rich 統一:右側 text column 用 justify-center + minHeight=avatar。
 * 短文字置中於 avatar,長文字(多行名字)自然撐高。
 *
 * ── Info fields ──
 * Status message / ID / Employee number 等唯讀屬性全部用 DescriptionList 家族
 * 承載(不手刻 dt/dd),canonical 由 DS primitive own。
 */

const AVATAR_SIZE = 64

type StatusType = 'online' | 'away' | 'busy' | 'offline'

// Presence semantic tokens(見 color/semantic.css)——跟 Avatar status dot 共用
const STATUS_DOT_COLOR: Record<StatusType, string> = {
  online: 'var(--status-online)',
  away: 'var(--status-away)',
  busy: 'var(--status-busy)',
  offline: 'var(--status-offline)',
}

const STATUS_LABEL: Record<StatusType, string> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
}

export interface NameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  avatar?: AvatarData
  subtitle?: string
  status?: StatusType
  statusMessage?: React.ReactNode
  actions?: React.ReactNode
  fields?: { label: string; value: string }[]
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
        {/* ── Profile header: avatar + name ── */}
        <div className="flex items-start gap-3 px-4 py-3">
          <Avatar
            src={avatar?.src}
            alt={avatar?.alt ?? name}
            color={avatar?.color}
            size={AVATAR_SIZE}
            status={status}
            className="shrink-0"
          />
          {/* NameCard typography:label body-lg(16/1.5) + desc body(14/1.5) = reading mode + size="lg"。
              labelClassName escape hatch 加 font-medium(card context 語意)+ labelTruncate=false 允許 wrap。 */}
          <ItemContent
            label={name}
            description={subtitle}
            mode="reading"
            size="lg"
            labelTruncate={false}
            labelClassName="text-body-lg font-medium text-foreground"
            className="justify-center"
            style={{ minHeight: AVATAR_SIZE }}
          />

        </div>

        {/* ── Action buttons ──
            均分空間 + 填滿格子(canonical):多個 action 等寬瓜分容器寬度,
            單一 action 也撐滿容器 → 視覺上「行動列」永遠佔滿 NameCard 底部。
            `grid grid-flow-col auto-cols-fr`:每個 child 自動 1fr;
            `[&>*]:w-full`:Button 預設 inline-flex 不 stretch,強制 w-full 填滿 grid cell。
            世界級對照:iOS contact card / macOS contact / LinkedIn profile card 的 action row。 */}
        {actions && (
          <div className="grid grid-flow-col auto-cols-fr gap-2 px-4 pb-3 [&>*]:w-full">
            {actions}
          </div>
        )}

        {/* ── Status badge + message ── */}
        {hasStatus && (
          <div className="border-t border-divider px-4 py-3 flex flex-col gap-3">
            {/* Status badge — dot 色走 --status-* presence token,label 走 STATUS_LABEL canonical */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_DOT_COLOR[status!] }}
              />
              <span className="text-body">{STATUS_LABEL[status!]}</span>
            </div>
            {/* Status message — 必須包在 DescriptionList 才語意正確(dt/dd 必須在 dl 內) */}
            {statusMessage && (
              <DescriptionList>
                <DescriptionItem label="Status message">
                  <span className="line-clamp-2">{statusMessage}</span>
                </DescriptionItem>
              </DescriptionList>
            )}
          </div>
        )}

        {/* ── Info fields ── */}
        {hasFields && (
          <div className="border-t border-divider px-4 py-3">
            <DescriptionList cols={2}>
              {fields!.map((f) => (
                <DescriptionItem key={f.label} label={f.label}>{f.value}</DescriptionItem>
              ))}
            </DescriptionList>
          </div>
        )}

        {/* ── View more ── */}
        {onViewMore && (
          <div className="border-t border-divider px-4 py-2">
            <Button variant="link" size="sm" onClick={onViewMore} className="w-full">{viewMoreLabel}</Button>
          </div>
        )}
      </div>
    )
  },
)
NameCard.displayName = 'NameCard'

export { NameCard }
