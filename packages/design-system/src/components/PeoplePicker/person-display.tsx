// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { X } from 'lucide-react'
import { EMPTY_DISPLAY } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { OverflowIndicator } from '@/design-system/components/OverflowIndicator/overflow-indicator'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { useTableIsScrolling } from '@/design-system/components/Field/field-context'
import { ItemPrefix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import {
  getAvatarStackVisibleCount,
  AVATAR_STACK_AVATAR_PX,
  AVATAR_STACK_OVERFLOW_CHIP_PX,
} from './avatar-stack-overflow'

// ── Types ───────────────────────────────────────────────────────────────────

// PersonData 承載 ProfileCard 所需的完整資訊。DS 全域 person avatar 的 hoverCard ProfileCard 永遠
// 顯示同一組 sections(name + subtitle + status + 4 default fields + 自訂 fields + actions + View more)
// — 缺資料顯 placeholder,不會 collapse。對齊 avatar.spec.md「person avatar hover → ProfileCard」
// DS-wide canonical(2026-05-06 v11 always-render schema 升級)。
export interface PersonData {
  name: string
  avatarUrl?: string
  /** 角色 / 部門 / ID 等 meta 單行(ProfileCard subtitle) */
  description?: string
  /** Presence 狀態(對齊 Avatar presence canonical)。**2026-05-14 v12 update**(per user 拍板):
   *  production 每 user 一定有 presence state,**undefined = loading transient(資料還沒讀到)**,
   *  不是「user 沒設定」。ProfileCard 在 undefined 期間隱藏整 status block,**禁** render「Status not set」
   *  placeholder 文字。 */
  status?: 'online' | 'away' | 'busy' | 'offline'
  /** Status 訊息(ProfileCard status section)。只在 status defined 時 render,缺則顯 `—` placeholder。
   *  Status undefined 整 block skip(無 statusMessage 也跟著 skip)。 */
  statusMessage?: React.ReactNode
  /** **2026-05-07 v15.7 user directive**:ProfileCard default 只 render `id` + `employeeNumber`,
   *  其他 description 一律 opt-in by consumer 透過 `fields` array prop。對齊
   *  `NAMECARD_DEFAULT_FIELD_KEYS = ['id', 'employeeNumber']`。 */
  id?: string
  employeeNumber?: string
  /** 自訂額外 fields(在 default fields 之後 append)。Email / Phone / Department / Location
   *  / 任何其他 description 一律走這個 prop(opt-in,consumer 自選)。 */
  fields?: { label: string; value: string }[]
  /** 跳至完整 profile 頁的 handler(hover ProfileCard 必含,不傳時 fallback noop placeholder) */
  onViewProfile?: () => void
}

export type PersonValue = string | PersonData

function resolvePerson(value: PersonValue): PersonData {
  return typeof value === 'string' ? { name: value } : value
}

// buildPersonProfileCard — DS 全域 person avatar hoverCard 的 canonical ProfileCard JSX 建構器。
// SSOT for「avatar hover ProfileCard 一致視覺」— 任何 person avatar consumer 都走這個 helper,
// 不可繞道直接 build ProfileCard。
//
// **2026-05-07 v15.7 user directive**:default field values 只 `id` + `employeeNumber`,
// 對齊 NAMECARD_DEFAULT_FIELD_KEYS。其他 description(email/phone/department/location/etc)
// consumer 想顯式透過 `person.fields` opt-in 傳入。
function buildPersonProfileCard(person: PersonData): React.ReactNode {
  return (
    <ProfileCard
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
      actions={<ProfileCardDefaultActions />}
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
// Consume DS `Avatar` primitive(2026-04-22 refactor,M1 SSOT consumption)+ 預設 ProfileCard
// hoverCard(avatar.spec.md DS-wide「person avatar hover → ProfileCard」canonical)。
//
// 之前用 local `<img>` / `<User icon />` hand-craft 繞過 DS Avatar,違反 M1。本次 refactor:
// - 所有 person avatar 經過 DS Avatar primitive(size 對應 uiSize family,fallback / icon / badge 集中管理)
// - 人員資訊 → ProfileCard(subtitle = description,actions = ProfileCardDefaultActions)

// 2026-05-13 (a) perf fix(per codex Layer C HoverCard subtree dominant):
// useMemo `buildPersonProfileCard` per-person stable ref。原 every render call → new JSX ref →
// Avatar.memo bails → HoverCard subtree 重建。Stable ref → memo skip → big win on scroll。
//
// (c) push-up scroll-defer:當 DataTable virtualizer.isScrolling=true,**完全不 build ProfileCard**
// (Avatar 收 undefined → 跳 HoverCard wrapper)。原 (c) v1 在 Avatar 層 skip wrapper 但 ProfileCard
// JSX subtree 仍在此處 build → 浪費 React reconciliation work。push 到此處才真省。
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
  const isTableScrolling = useTableIsScrolling()
  const nameCard = React.useMemo(
    () => (isTableScrolling ? undefined : buildPersonProfileCard(person)),
    [person, isTableScrolling]
  )
  return (
    <Avatar
      src={person.avatarUrl}
      alt={person.name}
      size={AVATAR_PX[size]}
      className={className}
      style={style}
      hoverCard={nameCard}
    />
  )
}

// ── Single Person Display ───────────────────────────────────────────────────

// 2026-05-14 item-anatomy SSOT fix(per codex+Layer A 共識 path (a) + user 拍板「全部做完」):
// outer 改 items-start + Avatar 外包 ItemPrefix primitive consumption。單行視覺 = items-center 等效;
// 多行(autoRowHeight cell)避免 avatar+name center 整 row 不對齊 first-line text top。M1 消費既有
// 對齊 TreeView / MenuItem / SelectionItem 共用 ItemPrefix wrap chevron/icon/avatar canonical。
function PersonDisplay({ value, size = 'md' }: { value?: PersonValue | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const person = resolvePerson(value)

  // 2026-05-14 I1 fix(per codex addendum verdict):outer `inline-flex` → `flex w-full`
  // 完成 truncate 寬度約束鏈。原 inline-flex content-width parent constrain 不到 name span
  // → cell overflow-hidden 硬裁 → ellipsis dots 不可見。改 flex(block-level full width)
  // + inner name span `flex-1 min-w-0 truncate` 真實 truncate-with-ellipsis 顯示。
  // 對齊 GitHub Primer ActionList / Slack users_select / Atlassian UserPicker truncation canonical。
  return (
    <span className="flex items-start gap-2 min-w-0 w-full">
      <ItemPrefix><PersonAvatar person={person} size={size} /></ItemPrefix>
      <span className="truncate flex-1 min-w-0">{person.name}</span>
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
  measured = false,
  onRemove,
}: {
  value?: PersonValue[] | null
  size?: 'sm' | 'md' | 'lg'
  /** 最多顯示幾個 avatar(不含 +N),預設 3。`measured=true` 時忽略此 prop(改 container width 算)*/
  max?: number
  /**
   * 2026-05-15 codex Round 5 C+ SSOT fix:`measured=true` 啟動 container-width 量測(取代 hardcode `max ?? 3`)
   * → display + edit stack 同 algorithm(同 cell width → 同 overflow 判斷),不再 display 用固定 3 vs edit
   * 用 useOverflowCount。對齊 field-controls.spec.md:286 「4-mode 共享 renderer」contract + user round 3
   * verbatim「同空間兩判斷點」SSOT directive。Default false 保 backward compat(non-cell context 仍 max ?? 3)。
   */
  measured?: boolean
  /** 傳入時啟用 dismiss(edit mode),callback 接收被移除的 person */
  onRemove?: (person: PersonValue) => void
}) {
  if (!value || value.length === 0) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  // 2026-05-15 Bug 3 fix(Claude+Codex Step 5 比稿 consensus):消費 shared `avatar-stack-overflow`
  // primitive。原 inline canvas-based formula 是 dual-implementation 違反 user SSOT「同 cell width 同
  // overflow 判斷」(edit path 用 Combobox useOverflowCount DOM offsetWidth / display path 用 inline
  // canvas)。**抽 primitive 統一**:display + edit 共用 `getAvatarStackVisibleCount` formula。
  // SSOT in `./avatar-stack-overflow.ts`,M14 mechanical guard 防 future drift。
  const containerRef = React.useRef<HTMLSpanElement>(null)
  const [measuredCount, setMeasuredCount] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    if (!measured) return
    const el = containerRef.current
    if (!el) return
    const calc = () => {
      const visible = getAvatarStackVisibleCount({
        availablePx: el.clientWidth,
        total: value.length,
        avatarPx: AVATAR_STACK_AVATAR_PX[size],
        overflowChipPx: AVATAR_STACK_OVERFLOW_CHIP_PX[size],
      })
      setMeasuredCount(visible)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measured, size, value])

  const resolvedMax = measured && measuredCount !== null ? measuredCount : (max ?? 3)
  const people = value.map(resolvePerson)
  const visible = people.slice(0, resolvedMax)
  const hidden = people.slice(resolvedMax)
  const overflow = hidden.length

  // 單人回退到 PersonDisplay(顯示名字)
  if (people.length === 1) {
    return <PersonDisplay value={value[0]} size={size} />
  }

  // 2026-05-14 item-anatomy SSOT fix(per codex+Layer A 共識):outer items-start + avatar stack
  // 鎖 first-line baseline(整 stack 是 prefix slot,h-[1lh] 對齊 first line)。
  return (
    <span ref={containerRef} className="inline-flex items-start min-w-0">
      <ItemPrefix className="!justify-start"><span className="inline-flex items-center min-w-0">
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
              color="neutral"
              size="sm"
              // Tag.avatar 是 ReactNode(非 AvatarData object)——傳 <Avatar> 元素。
              // Tag 內部用 `w-4 h-4 rounded-full` 容器 slot,Avatar 填滿 object-cover。
              // **hoverCard 必帶**(avatar.spec.md DS-wide canonical:所有 person avatar 必 hover → ProfileCard)。
              // 跟 PersonAvatar 共用 `buildPersonProfileCard` helper 確保顯示資訊一致。
              avatar={
                <Avatar
                  src={person.avatarUrl}
                  alt={person.name}
                  size={16}
                  hoverCard={buildPersonProfileCard(person)}
                />
              }
              onRemove={onRemove ? () => onRemove(value![resolvedMax + i]) : undefined}
            >
              {person.name}
            </Tag>
          ))}
        </OverflowIndicator>
      )}
      </span></ItemPrefix>
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

export { PersonDisplay, MultiPersonDisplay, PersonAvatarTag, buildPersonProfileCard, resolvePerson }
