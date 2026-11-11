import React from 'react'
import { cn } from '@/lib/utils'
import { SectionTitle, SectionDescription, SPEC_HEADING_GAP, SPEC_HEADING_GAP_PARAGRAPH, specHeadingContent, useHeadingContent } from '../examples/tutorial-page'

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
 * - 區塊(預設):標題區(小標 + 說明)→ 內容看底下幾塊(2026-11-11,layoutSpace.spec.md 規則 3「標題區 → 內容」):
 *   只有一塊(一張表、一張圖、一個元件)= `--layout-space-tight`;兩塊以上並列 = `--layout-space-loose`(user 2026-10-21 A4 甲)。
 *   幾塊由 tutorial-page.tsx `headingContentOf` 數(數「自己之後、下一個小標之前」的兄弟節點),值也只寫在那裡(`SPEC_HEADING_GAP`)。
 * - 段落(`<H3 paragraph>`):底下是一段純文字 / 清單 → 標題區 → 文字 = `--layout-space-tight`(內容之間本來就是 tight,
 *   同 tutorial-page.tsx `createTutorialRule` 不給 `examples` 那種規則)。之前寫死 `mb-2` / `mb-4`(8 / 16,不跟密度)。
 */
export const H3 = ({ children, paragraph }: { children: React.ReactNode; paragraph?: boolean }) => {
  const ref = React.useRef<HTMLHeadingElement>(null)
  // 緊接著自己的說明 → 標題區的尾巴是說明,幾塊由說明判;段落一律 tight,不判
  useHeadingContent(ref, (el) => (paragraph || el.nextElementSibling?.hasAttribute('data-spec-desc') ? null : specHeadingContent(el)))
  return (
    <SectionTitle
      ref={ref}
      data-spec-heading={paragraph ? 'paragraph' : 'block'}
      className={cn(
        paragraph ? SPEC_HEADING_GAP_PARAGRAPH : SPEC_HEADING_GAP,
        // 緊接著自己的說明 → 2px(說明的下方再給標題區 → 內容的距離)
        'has-[+[data-spec-desc]]:mb-[var(--item-gap-label-desc-scanning)]',
      )}
    >
      {children}
    </SectionTitle>
  )
}

export const Desc = ({ children }: { children: React.ReactNode }) => {
  const ref = React.useRef<HTMLParagraphElement>(null)
  useHeadingContent(ref, (el) => (el.previousElementSibling?.getAttribute('data-spec-heading') === 'paragraph' ? null : specHeadingContent(el)))
  return (
    <SectionDescription
      ref={ref}
      data-spec-desc=""
      className={cn(SPEC_HEADING_GAP, '[[data-spec-heading=paragraph]+&]:mb-[var(--layout-space-tight)]')}
    >
      {children}
    </SectionDescription>
  )
}

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

/* ═══════════════════════════════════════════════════════════════════════════
   設計規格頁「元件檢閱器 / 色彩對照表」的小工具(2026-10-27 BA-helper-dedup)
   原本各頁逐字抄一份(scripts/story-helper-duplication-baseline.json:TkVal 16 份、PropRow 12 + 2 份、BpZone 10 份、
   Swatch 9 + 3 + 2 份、TokenAnnotation 3 + 2 份、SizeSpec 3 份、Z 2 份)。收成這一份;各頁改 import 由各家族的 *-dedup 項做,
   改用後逐則像素 0 差(預設值與各抄本相同;抄本之間本來就不同的地方用參數保留,寫在各支的說明)。
   ═══════════════════════════════════════════════════════════════════════════ */

/** token 名(主)+ 解析值(次):檢閱器的值欄。 */
export const TkVal = ({ token, value }: { token: string; value?: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-mono text-[12px] text-fg-secondary">{token}</span>
    {value && <span className="font-mono text-[10px] text-fg-muted">{value}</span>}
  </div>
)

/**
 * 檢閱器的一列:左欄標籤(可帶色點)+ 右欄值。
 * `labelTone`:12 份抄本的標籤是 `text-fg-muted`(預設);Combobox / Tag 兩份在 169c33de(2026-06-11 deep audit)改成
 * `text-fg-secondary` —— 兩種並存是既有的不一致,收成一份時用參數保留現況(要不要統一另案,不在 0 像素差的去重範圍)。
 */
export const PropRow = ({
  label,
  dot,
  labelTone = 'muted',
  children,
}: {
  label: string
  dot?: string
  labelTone?: 'muted' | 'secondary'
  children: React.ReactNode
}) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span
      className={`text-[11px] ${labelTone === 'secondary' ? 'text-fg-secondary' : 'text-fg-muted'} font-medium w-[72px] shrink-0 pt-0.5 flex items-center gap-1.5`}
    >
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
      {label}
    </span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/** 結構圖的區塊色(底 / 虛線框 / 字)。 */
export interface ZoneColor {
  bg: string
  border: string
  text: string
}

/**
 * Input / DatePicker 設計規格頁的區塊色(邊距 / 圖示 / 間距 / 輸入區 / 動作 / 尺寸標註);兩頁原本各抄一份逐字相同的 `Z`。
 * 其他頁的 `Z` 鍵與顏色各不相同(各頁自己的結構),不併進來。
 */
export const INPUT_ZONES = {
  pad: { bg: 'rgba(194,225,154,0.6)', border: 'rgba(139,179,91,0.9)', text: '#5a7a2e' },
  icon: { bg: 'rgba(166,208,245,0.6)', border: 'rgba(80,145,210,0.9)', text: '#2d6a9f' },
  gap: { bg: 'rgba(253,218,158,0.6)', border: 'rgba(218,165,60,0.9)', text: '#8a6010' },
  input: { bg: 'rgba(199,178,230,0.6)', border: 'rgba(138,103,190,0.9)', text: '#6035a8' },
  action: { bg: 'rgba(245,180,180,0.6)', border: 'rgba(210,100,100,0.9)', text: '#9f2d2d' },
  dim: { text: '#d04040' },
}

/**
 * 結構圖的一個區塊(寬度固定、虛線左右框、置中標籤 + 小字註記)。
 * 小字註記淡化 = 色彩 token `text-fg-muted`(2026-10-28 BA-opacity:原本區塊色 + `opacity-70`;opacity.spec.md 的 opacity 只給 disabled 一個 role)。
 */
export const BpZone = ({ w, color, label, sub }: { w: number; color: ZoneColor; label: string; sub?: string }) => (
  <div className="flex flex-col items-center justify-center shrink-0 gap-0.5"
    style={{ width: w, height: '100%', background: color.bg, borderLeft: `1.5px dashed ${color.border}`, borderRight: `1.5px dashed ${color.border}` }}>
    <span className="text-[11px] font-mono font-bold leading-none" style={{ color: color.text }}>{label}</span>
    {sub && <span className="text-[9px] font-mono leading-none text-fg-muted">{sub}</span>}
  </div>
)

/** Input / LinkInput / NumberInput 設計規格頁的尺寸列(三頁原本各抄一份逐字相同的 `SizeSpec`)。 */
export interface FieldSizeSpec {
  heightToken: string; height: string
  pxToken: string; px: number
  gapToken: string; gap: number
  fontToken: string; font: string
  icon: number
  actionHover: number
}

/**
 * 色彩對照表格子底下的 token 註記:bg / text / border(+ 有 `icon` 時多一列 icon)。
 * 兩種抄本的差別只在有沒有 icon 那一列(Combobox / DatePicker 的 ColorSpec 有 icon;Button / DropdownMenu / LinkInput 沒有),
 * 由傳入的物件有沒有 `icon` 決定,不另開參數。
 */
export const TokenAnnotation = ({ colors }: { colors: { bg: string; text: string; border: string; icon?: string } }) => (
  <div className="flex flex-col gap-0.5 mt-2">
    {(colors.icon === undefined
      ? ([['bg', 'bg'], ['text', 'text'], ['border', 'bdr']] as const)
      : ([['bg', 'bg'], ['text', 'text'], ['border', 'bdr'], ['icon', 'icon']] as const)
    ).map(([key, label]) => (
      <span key={key} className="inline-flex items-center gap-1 text-[10px]">
        <Swatch value={colors[key] ?? ''} size="sm" />
        <span className="text-fg-muted w-5 shrink-0">{label}</span>
        <span className="font-mono text-fg-secondary">{colors[key]}</span>
      </span>
    ))}
  </div>
)
