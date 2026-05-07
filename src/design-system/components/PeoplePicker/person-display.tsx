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
        // **2026-05-07 v15.11 Bug D 升級 SSOT**:visible avatar 也支援 inline dismiss
        // (對齊 user directive「avatar = tag」)。Dismiss overlay 走 `AvatarDismissOverlay`
        // 共用 SSOT(下方 export),Combobox tagRenderer / 此處 / 任何 future avatar consumer
        // 都用同一視覺 — 紅圈 X 對齊 avatar 右上,hover/focus-visible 才顯。
        const handleDismiss = onRemove ? () => onRemove(value![i]) : undefined
        return (
          <span key={person.name + i} className={`relative inline-flex group/avatar ${i > 0 ? '-ml-0.5' : ''}`} style={{ zIndex: visible.length - i }}>
            <PersonAvatar
              person={person}
              size={size}
              className="ring-2 ring-[var(--surface)]"
            />
            {handleDismiss && <AvatarDismissOverlay onRemove={handleDismiss} label={person.name} />}
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

// ── AvatarDismissOverlay ────────────────────────────────────────────────────
// SSOT for「person avatar overlay dismiss」(2026-05-07 v15.12,user spec confirmed)。
//
// **Visual canonical**(對齊 DS new token `--surface-strong`):
//   - **12×12 圓**(固定,不隨 field size 變)
//   - **bg `--surface-strong`**(neutral-6),hover → `--surface-strong-hover`
//     (light=neutral-5 / dark=neutral-7,跨 mode 對稱)
//   - **X icon size=12 strokeWidth=3.5**(icon 跟底色一樣大,對齊 checkbox checkmark
//     sm/md stroke 規格)
//   - **text-on-emphasis**(白 X,確保飽和色底對比)
//   - **位置 `absolute top-0 right-0`**(button 右上角貼齊 avatar 右上角,完全在 avatar
//     內 — user-confirmed canonical)
//
// **a11y**(codex P1 fix):`opacity-0` 而非 `display:none` — element 在 DOM/tab-order,
// keyboard tab 可達,觸控 focus-within 也顯。Hover / focus-within / focus-visible
// 三條件之一觸發 `opacity-100`。
//
// **Why centralize**:Combobox tagRenderer (PeoplePicker stack mode) + MultiPersonDisplay
// dismiss 共用 SSOT,改 1 處全 sync(M17 propagation)。
function AvatarDismissOverlay({ onRemove, label }: { onRemove: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      aria-label={`移除 ${label}`}
      className={[
        // **Position(2026-05-07 v15.15 user-confirmed)**:asymmetric `-top-px -right-1`
        // (top -1px / right -4px)— field padding-y(4px sm/md)緊 → top 只 -1px 安全;
        // padding-x 12px 寬鬆 → right 凸 4px 達 badge canonical visual。對齊 ClickUp
        // 世界級 idiom(asymmetric offset by avatar/field size constraint)。
        'absolute -top-px -right-1 z-10',
        'inline-flex items-center justify-center',
        // **12×12 + 2px white ring**(SSOT match stacked avatar,Slack/Material/iOS
        // notification badge 2px ring canonical)。改用 `[box-shadow:...]` 而非 `ring-2`
        // 避免跟下方 `focus-visible:ring-2` 在 tailwind-merge 衝突(同 ring family
        // override 互殺)。Box-shadow inset 0 不影響 layout,也不被 focus-visible ring
        // 蓋掉(focus 那邊另一條 outline ring 不同 layer)。
        'w-3 h-3 rounded-full [box-shadow:0_0_0_2px_var(--surface)]',
        // bg-surface-strong = neutral-6-opaque / hover = neutral-7-opaque(both modes,
        // step-7 dark 公式自動 lighter → engaged 跨 mode 對稱)
        'bg-surface-strong text-on-emphasis hover:bg-surface-strong-hover',
        // a11y(codex P1 fix):opacity 而非 display:none — element 在 DOM/tab-order,
        // keyboard 可達。Hover / focus-within / focus-visible 三條件之一觸發。
        'opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 focus-visible:opacity-100',
        'transition-opacity duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
      ].join(' ')}
    >
      <X size={12} strokeWidth={3.5} aria-hidden />
    </button>
  )
}

// ── PersonAvatarTag(Combobox tagRenderer SSOT for stack mode)─────────────
// PeoplePicker `multiDisplay='stack'` 模式 wraps Combobox,tagRenderer 不能用 Tag pill
// (那是 pill mode),改 render 此元件 — Avatar overlap 視覺 + AvatarDismissOverlay。
// 對齊 user directive「avatar = tag 概念,差別只在視覺,SSOT 一致」(2026-05-07 v15.13)。
//
// **架構**(v15.13 重構):本元件**不自包** `group/avatar` / `-ml-0.5` overlap wrapper,
// 因 Combobox `tagRenderer` 結果會被內部 `<div shrink-0>` 包成 measurement wrapper
// (useOverflowCount 必要)。把 overlap + group 拉到 Combobox 的 `tagWrapperClassName`
// 上,sibling-level overlap + group selector 才能正確 chain → AvatarDismissOverlay 的
// `group-hover/avatar:opacity-100` 才會通。
function PersonAvatarTag({
  person, size = 'md', onRemove,
}: {
  person: PersonData
  size?: 'sm' | 'md' | 'lg'
  onRemove?: () => void
}) {
  return (
    <>
      <PersonAvatar person={person} size={size} className="ring-2 ring-[var(--surface)]" />
      {onRemove && <AvatarDismissOverlay onRemove={onRemove} label={person.name} />}
    </>
  )
}
PersonAvatarTag.displayName = 'PersonAvatarTag'

export { PersonDisplay, MultiPersonDisplay, PersonAvatar, PersonAvatarTag, buildPersonNameCard, resolvePerson }
