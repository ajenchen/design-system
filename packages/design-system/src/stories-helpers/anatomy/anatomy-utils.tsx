import React from 'react'
import { cn } from '@/lib/utils'
import { SectionTitle, SectionDescription } from '../examples/tutorial-page'

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

/**
 * 設計規格頁的小標與說明(2026-10-27 A4;長相與 `ExampleSection` 同一份 —— `SectionTitle` / `SectionDescription`)。
 * 這兩個是兄弟節點、各頁直接排在內容前面,所以間距用下方 margin 給(其他地方一律用 `ExampleSection` 的外層 gap):
 * - 小標 ↔ 它自己的說明 = 2px(`--item-gap-label-desc-scanning`,text-h6 + text-caption 正是 item-anatomy scanning 那一型);
 * - 區塊(預設):小標(+ 說明)底下是並列的內容(表格、圖、範例格)→ 標題區 → 內容 = `--layout-space-loose`,跟著密度走
 *   (user 2026-10-21 A4 甲:標題 + 說明是整組內容的標題,內容之間是 loose,它到內容也是 loose);
 * - 段落(`<H3 paragraph>`):底下是一段純文字 / 清單 → 標題區 → 文字 = `--layout-space-tight`(內容之間本來就是 tight,
 *   同 tutorial-page.tsx `createTutorialRule` 不給 `examples` 那種規則)。之前寫死 `mb-2` / `mb-4`(8 / 16,不跟密度)。
 */
export const H3 = ({ children, paragraph }: { children: React.ReactNode; paragraph?: boolean }) => (
  <SectionTitle
    data-spec-heading={paragraph ? 'paragraph' : 'block'}
    className={cn(
      paragraph ? 'mb-[var(--layout-space-tight)]' : 'mb-[var(--layout-space-loose)]',
      // 緊接著自己的說明 → 2px(說明的下方再給標題區 → 內容的距離)
      'has-[+[data-spec-desc]]:mb-[var(--item-gap-label-desc-scanning)]',
    )}
  >
    {children}
  </SectionTitle>
)

export const Desc = ({ children }: { children: React.ReactNode }) => (
  <SectionDescription
    data-spec-desc=""
    className={cn('mb-[var(--layout-space-loose)]', '[[data-spec-heading=paragraph]+&]:mb-[var(--layout-space-tight)]')}
  >
    {children}
  </SectionDescription>
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
