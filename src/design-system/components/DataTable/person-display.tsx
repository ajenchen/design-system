import { EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'
import { Tag } from '@/design-system/components/Tag/tag'

// ── Initials ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PersonValue = string | { name: string; avatarUrl?: string }

function resolvePerson(value: PersonValue): { name: string; avatarUrl?: string } {
  return typeof value === 'string' ? { name: value } : value
}

// ── Avatar Size ─────────────────────────────────────────────────────────────
// 與 Tag 高度對齊：sm=20px, md/lg=24px

const avatarSizePx: Record<string, number> = { sm: 20, md: 24, lg: 24 }
const avatarSizeClass: Record<string, string> = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-6 h-6' }
const initialsText: Record<string, string> = { sm: 'text-[10px]', md: 'text-caption', lg: 'text-caption' }

// ── Avatar（共用）────────────────────────────────────────────────────────────

function Avatar({ person, size = 'md', className = '' }: { person: { name: string; avatarUrl?: string }; size?: string; className?: string }) {
  const { name, avatarUrl } = person
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 ${avatarSizeClass[size]} rounded-full object-cover ${className}`}
      />
    )
  }
  return (
    <span
      className={`shrink-0 ${avatarSizeClass[size]} rounded-full inline-grid place-content-center ${initialsText[size]} font-medium leading-none bg-muted text-foreground ${className}`}
    >
      {getInitials(name)}
    </span>
  )
}

// ── Single Person Display ───────────────────────────────────────────────────

function PersonDisplay({ value, size = 'md' }: { value?: PersonValue | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const person = resolvePerson(value)

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar person={person} size={size} />
      <span className="truncate">{person.name}</span>
    </span>
  )
}
PersonDisplay.displayName = 'PersonDisplay'

// ── Multi Person Display ────────────────────────────────────────────────────
// 多人堆疊：avatar 重疊（-2px），不顯示人名。
// 溢出時顯示 +N 指示器，hover 出 tooltip 列出溢出的人（avatar + 人名 tag）。

function MultiPersonDisplay({
  value,
  size = 'md',
  max,
}: {
  value?: PersonValue[] | null
  size?: 'sm' | 'md' | 'lg'
  /** 最多顯示幾個 avatar（不含 +N），預設 3 */
  max?: number
}) {
  if (!value || value.length === 0) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const resolvedMax = max ?? 3
  const people = value.map(resolvePerson)
  const visible = people.slice(0, resolvedMax)
  const hidden = people.slice(resolvedMax)
  const overflow = hidden.length
  const px = avatarSizePx[size]

  // 單人回退到 PersonDisplay（顯示名字）
  if (people.length === 1) {
    return <PersonDisplay value={value[0]} size={size} />
  }

  return (
    <span className="inline-flex items-center min-w-0">
      {visible.map((person, i) => (
        <Avatar
          key={person.name + i}
          person={person}
          size={size}
          className={`ring-2 ring-[var(--surface)] ${i > 0 ? '-ml-0.5' : ''}`}
        />
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`shrink-0 ${avatarSizeClass[size]} rounded-full inline-grid place-content-center ${initialsText[size]} font-medium leading-none bg-muted text-foreground ring-2 ring-[var(--surface)] -ml-0.5 cursor-default`}
            >
              +{overflow}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1">
              {hidden.map((person, i) => (
                <Tag
                  key={person.name + i}
                  variant="neutral"
                  size="sm"
                  className="max-w-none"
                  avatar={<Avatar person={person} size="sm" className="!w-4 !h-4" />}
                >
                  {person.name}
                </Tag>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}
MultiPersonDisplay.displayName = 'MultiPersonDisplay'

export { PersonDisplay, MultiPersonDisplay, Avatar }
