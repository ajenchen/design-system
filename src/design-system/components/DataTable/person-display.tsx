import type React from 'react'
import { User } from 'lucide-react'
import { EMPTY_DISPLAY } from '@/design-system/components/fields/field-wrapper'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'

// ── Types ───────────────────────────────────────────────────────────────────

export type PersonValue = string | { name: string; avatarUrl?: string }

function resolvePerson(value: PersonValue): { name: string; avatarUrl?: string } {
  return typeof value === 'string' ? { name: value } : value
}

// ── Avatar Size ─────────────────────────────────────────────────────────────
// 與 Tag 高度對齊：sm=20px, md/lg=24px

const avatarSizeClass: Record<string, string> = { sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-6 h-6' }
const iconSize: Record<string, number> = { sm: 12, md: 14, lg: 14 }

// ── Avatar（共用）────────────────────────────────────────────────────────────
// 有圖片 → 圖片。無圖片 → neutral 圓 + User icon（不用文字 initials）。

function Avatar({ person, size = 'md', className = '', style }: { person: { name: string; avatarUrl?: string }; size?: string; className?: string; style?: React.CSSProperties }) {
  if (person.avatarUrl) {
    return (
      <img
        src={person.avatarUrl}
        alt=""
        className={`shrink-0 ${avatarSizeClass[size]} rounded-full object-cover ${className}`}
        style={style}
      />
    )
  }
  return (
    <span
      className={`shrink-0 ${avatarSizeClass[size]} rounded-full inline-grid place-content-center bg-muted text-fg-muted ${className}`}
      style={style}
    >
      <User size={iconSize[size]} aria-hidden />
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
// 第一個 avatar z-index 最高（在最上面），依此類推。
// 溢出時顯示 +N 指示器，hover 出 tooltip 列出溢出的人（avatar + 人名）。

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
          style={{ zIndex: visible.length - i }}
        />
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`shrink-0 ${avatarSizeClass[size]} rounded-full inline-grid place-content-center text-[10px] font-medium leading-none bg-muted text-foreground ring-2 ring-[var(--surface)] -ml-0.5 cursor-default`}
            >
              +{overflow}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1">
              {hidden.map((person, i) => (
                <span key={person.name + i} className="inline-flex items-center gap-2 min-w-0">
                  <Avatar person={person} size="sm" />
                  <span className="text-caption">{person.name}</span>
                </span>
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
