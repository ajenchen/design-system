import { EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'

// ── Initials ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Avatar 色彩 ─────────────────────────────────────────────────────────────
// 用名字 hash 穩定選色，不隨 render 變化。

const avatarColors = [
  'bg-[var(--info-subtle)] text-[var(--info)]',
  'bg-error-subtle text-error',
  'bg-success-subtle text-success',
  'bg-warning-subtle text-warning-foreground',
  'bg-[var(--color-turquoise-1)] text-[var(--color-turquoise-6)]',
  'bg-[var(--color-purple-1)] text-[var(--color-purple-6)]',
  'bg-[var(--color-magenta-1)] text-[var(--color-magenta-6)]',
  'bg-[var(--color-indigo-1)] text-[var(--color-indigo-6)]',
] as const

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PersonValue = string | { name: string; avatarUrl?: string }

function resolvePerson(value: PersonValue): { name: string; avatarUrl?: string } {
  return typeof value === 'string' ? { name: value } : value
}

// ── Avatar Size ─────────────────────────────────────────────────────────────
// 與 Tag 高度對齊：sm=20px, md/lg=24px

const avatarSize: Record<string, string> = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-6 h-6' }
const initialsText: Record<string, string> = { sm: 'text-[10px]', md: 'text-caption', lg: 'text-caption' }

// ── Display ─────────────────────────────────────────────────────────────────

function PersonDisplay({ value, size = 'md' }: { value?: PersonValue | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const { name, avatarUrl } = resolvePerson(value)

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className={`shrink-0 ${avatarSize[size]} rounded-full object-cover`}
        />
      ) : (
        <span
          className={`shrink-0 ${avatarSize[size]} rounded-full inline-grid place-content-center ${initialsText[size]} font-medium leading-none ${nameToColor(name)}`}
        >
          {getInitials(name)}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  )
}
PersonDisplay.displayName = 'PersonDisplay'

export { PersonDisplay }
