import React from 'react'

/**
 * Shared helper components for all `*.anatomy.stories.tsx` files.
 *
 * Canonical definitions picked from Button/button.anatomy.stories.tsx and
 * Slider/slider.anatomy.stories.tsx. Before duplicating these helpers locally,
 * consider whether the shared version meets your need — visual consistency
 * across anatomy stories is intentional.
 *
 * If you must diverge locally, add a comment explaining why.
 */

export const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-h6 font-semibold text-foreground mb-2">{children}</h3>
)

export const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted mb-4 max-w-[720px]">{children}</p>
)

export const Td = ({ children, mono, className }: { children: React.ReactNode; mono?: boolean; className?: string }) => (
  <td className={`border border-border px-3 py-1.5 text-caption ${mono ? 'font-mono' : ''} ${className ?? ''}`}>{children}</td>
)

export const Th = ({ children }: { children?: React.ReactNode }) => (
  <th className="border border-border px-3 py-1.5 text-caption text-fg-secondary bg-muted text-left">{children}</th>
)

/**
 * Token color preview swatch.
 * - `transparent` / `none` / `—` → checkerboard pattern (communicates "no color")
 * - `white` → literal #fff (CSS var won't resolve to white in all themes)
 * - otherwise → `var(--token-name)` via backgroundColor
 */
export const Swatch = ({ value, size = 'sm' }: { value: string; size?: 'sm' | 'md' }) => {
  const s = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  if (value === 'transparent' || value === 'none' || value === '—') {
    return (
      <span
        className={`${s} rounded-md shrink-0 border border-border inline-block align-middle`}
        style={{
          backgroundImage:
            'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)',
          backgroundSize: '6px 6px',
          backgroundPosition: '0 0,3px 3px',
        }}
      />
    )
  }
  return (
    <span
      className={`${s} rounded-md shrink-0 border border-black/10 inline-block align-middle`}
      style={{ backgroundColor: value === 'white' ? '#fff' : `var(${value})` }}
    />
  )
}

export const TokenCell = ({ token, display }: { token: string; display?: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <Swatch value={token} size="sm" />
    <span className="font-mono">{display ?? token}</span>
  </span>
)
