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
  'bg-primary-subtle text-primary',
  'bg-error-subtle text-error',
  'bg-success-subtle text-success',
  'bg-warning-subtle text-warning-foreground',
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

// ── Display ─────────────────────────────────────────────────────────────────
// Avatar 尺寸 = Badge md 高度 (24px = h-6)，與 Badge 對齊。

function PersonDisplay({ value }: { value?: PersonValue | null }) {
  if (!value) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>

  const { name, avatarUrl } = resolvePerson(value)

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="shrink-0 w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <span
          className={`shrink-0 w-6 h-6 rounded-full inline-grid place-content-center text-caption font-medium leading-none ${nameToColor(name)}`}
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
