import * as React from 'react'
import { X } from 'lucide-react'
import { EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { NameCard, NameCardDefaultActions } from '@/design-system/components/NameCard/name-card'

// ── Types ───────────────────────────────────────────────────────────────────

// PersonData 承載 NameCard 所需的完整資訊。DS 全域 person avatar 的 hoverCard NameCard 永遠
// 顯示同一組 sections(name + subtitle + status + 4 default fields + 自訂 fields + actions + View more)
// — 缺資料顯 placeholder,不會 collapse。對齊 avatar.spec.md「person avatar hover → NameCard」
// DS-wide canonical(2026-05-06 v11 always-render schema 升級)。
export interface PersonData {
  name: string
  avatarUrl?: string
  /** 角色 / 部門 / ID 等 meta 單行(NameCard subtitle) */
  description?: string
  /** Presence 狀態(對齊 Avatar presence canonical)。NameCard 永遠 render status section,
   *  缺則顯「Status not set」placeholder */
  status?: 'online' | 'away' | 'busy' | 'offline'
  /** Status 訊息(NameCard status section)。缺則顯 `—` */
  statusMessage?: React.ReactNode
  /** **2026-05-07 v15.7 user directive**:NameCard default 只 render `id` + `employeeNumber`,
   *  其他 description 一律 opt-in by consumer 透過 `fields` array prop。對齊
   *  `NAMECARD_DEFAULT_FIELD_KEYS = ['id', 'employeeNumber']`。 */
  id?: string
  employeeNumber?: string
  /** 自訂額外 fields(在 default fields 之後 append)。Email / Phone / Department / Location
   *  / 任何其他 description 一律走這個 prop(opt-in,consumer 自選)。 */
  fields?: { label: string; value: string }[]
  /** 跳至完整 profile 頁的 handler(hover NameCard 必含,不傳時 fallback noop placeholder) */
  onViewProfile?: () => void
}

export type PersonValue = string | PersonData

function resolvePerson(value: PersonValue): PersonData {
  return typeof value === 'string' ? { name: value } : value
}

// buildPersonNameCard — DS 全域 person avatar hoverCard 的 canonical NameCard JSX 建構器。
// SSOT for「avatar hover NameCard 一致視覺」— 任何 person avatar consumer 都走這個 helper,
// 不可繞道直接 build NameCard。
//
// **2026-05-07 v15.7 user directive**:default field values 只 `id` + `employeeNumber`,
// 對齊 NAMECARD_DEFAULT_FIELD_KEYS。其他 description(email/phone/department/location/etc)
// consumer 想顯式透過 `person.fields` opt-in 傳入。
function buildPersonNameCard(person: PersonData): React.ReactNode {
  return (
    <NameCard
      name={person.name}
      subtitle={person.description}
      avatar={{ src: person.avatarUrl, alt: person.name }}
      status={person.status}
      statusMessage={person.statusMessage}
      defaultFieldValues={{
        id: person.id,
        employeeNumber: person.employeeNumber,
      }}
      fields={person.fields}
      actions={<NameCardDefaultActions />}
      // onViewMore hover context 必含(avatar.spec.md canonical)。consumer 傳
      // `onViewProfile` 則用真 handler,否則 noop placeholder(UI 仍渲染 View more
      // footer,避免 preview 變死路)。
      onViewMore={person.onViewProfile ?? (() => {})}
    />
  )
}

// ── Avatar Size ─────────────────────────────────────────────────────────────
// 與 Tag 高度對齊:sm=20px, md/lg=24px(對齊 item-anatomy AVATAR_SIZE.inline)

const AVATAR_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 20, md: 24, lg: 24 }

// ── PersonAvatar ────────────────────────────────────────────────────────────
// Consume DS `Avatar` primitive(2026-04-22 refactor,M1 SSOT consumption)+ 預設 NameCard
// hoverCard(avatar.spec.md DS-wide「person avatar hover → NameCard」canonical)。
//
// 之前用 local `<img>` / `<User icon />` hand-craft 繞過 DS Avatar,違反 M1。本次 refactor:
// - 所有 person avatar 經過 DS Avatar primitive(size 對應 uiSize family,fallback / icon / badge 集中管理)
// - 人員資訊 → NameCard(subtitle = description,actions = NameCardDefaultActions)

function PersonAvatar({
  person,
  size = 'md',
  className = '',
  style,
}: {
  person: PersonData
  size?: 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Avatar
      src={person.avatarUrl}
      alt={person.name}
      size={AVATAR_PX[size]}
      className={className}
      style={style}
      hoverCard={buildPersonNameCard(person)}
    />
  )
}

// ── Single Person Display ───────────────────────────────────────────────────

function PersonDisplay({ value, size = 'md' }: { value?: PersonValue | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const person = resolvePerson(value)

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <PersonAvatar person={person} size={size} />
      <span className="truncate">{person.name}</span>
    </span>
  )
}
PersonDisplay.displayName = 'PersonDisplay'

// ── Multi Person Display ────────────────────────────────────────────────────
// 多人堆疊:avatar 重疊(-2px),不顯示人名。
// 第一個 avatar z-index 最高(在最上面),依此類推。
// 溢出時顯示 +N 指示器,hover 出 tooltip 列出溢出的人(avatar + 人名)。

function MultiPersonDisplay({
  value,
  size = 'md',
  max,
  onRemove,
}: {
  value?: PersonValue[] | null
  size?: 'sm' | 'md' | 'lg'
  /** 最多顯示幾個 avatar(不含 +N),預設 3 */
  max?: number
  /** 傳入時啟用 dismiss(edit mode),callback 接收被移除的 person */
  onRemove?: (person: PersonValue) => void
}) {
  if (!value || value.length === 0) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const resolvedMax = max ?? 3
  const people = value.map(resolvePerson)
  const visible = people.slice(0, resolvedMax)
  const hidden = people.slice(resolvedMax)
  const overflow = hidden.length

  // 單人回退到 PersonDisplay(顯示名字)
  if (people.length === 1) {
    return <PersonDisplay value={value[0]} size={size} />
  }

  return (
    <span className="inline-flex items-center min-w-0">
      {visible.map((person, i) => {
        // **2026-05-07 v15.10 Bug D fix — visible avatar 也支援 inline dismiss**:
        // 對齊 user directive「avatar = tag 概念,SSOT 一致」+ Notion / Linear / Slack
        // hover-shows-dismiss canonical。`onRemove` 傳入時(edit mode)hover 顯紅 X icon,
        // 點擊呼叫 onRemove。display / readonly mode(無 onRemove)avatar 純展示,維持
        // 既有 hover → NameCard 行為(buildPersonNameCard 在 PersonAvatar 內)。
        const handleDismiss = onRemove ? () => onRemove(value![i]) : undefined
        return (
          <span key={person.name + i} className={`relative inline-flex group/avatar ${i > 0 ? '-ml-0.5' : ''}`} style={{ zIndex: visible.length - i }}>
            <PersonAvatar
              person={person}
              size={size}
              className="ring-2 ring-[var(--surface)]"
            />
            {handleDismiss && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDismiss() }}
                aria-label={`Remove ${person.name}`}
                className="absolute -top-1 -right-1 hidden group-hover/avatar:inline-flex focus-visible:inline-flex items-center justify-center w-4 h-4 rounded-full bg-fg-secondary text-surface hover:bg-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <X size={10} aria-hidden />
              </button>
            )}
          </span>
        )
      })}
      {overflow > 0 && (
        <OverflowIndicator
          count={overflow}
          size={size}
          className="ring-2 ring-[var(--surface)] -ml-0.5"
        >
          {hidden.map((person, i) => (
            <Tag
              key={person.name + i}
              variant="neutral"
              size="sm"
              // Tag.avatar 是 ReactNode(非 AvatarData object)——傳 <Avatar> 元素。
              // Tag 內部用 `w-4 h-4 rounded-full` 容器 slot,Avatar 填滿 object-cover。
              // **hoverCard 必帶**(avatar.spec.md DS-wide canonical:所有 person avatar 必 hover → NameCard)。
              // 跟 PersonAvatar 共用 `buildPersonNameCard` helper 確保顯示資訊一致。
              avatar={
                <Avatar
                  src={person.avatarUrl}
                  alt={person.name}
                  size={16}
                  hoverCard={buildPersonNameCard(person)}
                />
              }
              onDismiss={onRemove ? () => onRemove(value![resolvedMax + i]) : undefined}
            >
              {person.name}
            </Tag>
          ))}
        </OverflowIndicator>
      )}
    </span>
  )
}
MultiPersonDisplay.displayName = 'MultiPersonDisplay'

export { PersonDisplay, MultiPersonDisplay, PersonAvatar, buildPersonNameCard, resolvePerson }
