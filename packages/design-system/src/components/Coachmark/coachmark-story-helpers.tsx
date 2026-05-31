import type { LucideIcon } from 'lucide-react'

/**
 * Shared media-illustration helper for all Coachmark story files
 * (`*.stories.tsx` / `*.anatomy.stories.tsx` / `*.principles.stories.tsx`).
 *
 * SSOT — 三檔共用單一定義,避免 placeholder gradient 在各檔重複 + drift。
 *
 * 設計約束(對齊 DS token 原則 + WCAG AA):
 * - `from` / `to` 必傳 DS color token(`var(--color-{hue}-N)` 如 indigo-6)— 禁硬寫 hex
 * - `bg-black/30` overlay 均勻壓暗:某些 DS primitive 色 lightness 較高
 *   (如 `--color-yellow-6` OKLCH L=0.87),白字直接疊上去會失去 AA 對比。
 *   壓暗 overlay 保證 icon+label 在任何 gradient 色上都 ≥ 4.5:1。
 * - 文字走 `text-on-emphasis`(DS emphasis-surface token)而非半透明 `text-white/90`,
 *   對齊 DS typography tier + 確保對比。
 */
export const MediaGradient = ({
  from,
  to,
  icon: Icon,
  label,
}: {
  from: string
  to: string
  icon: LucideIcon
  label: string
}) => (
  <div
    className="relative w-full h-full flex items-center justify-center"
    style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
  >
    {/* 均勻壓暗 overlay — 保底白字在任何 gradient 色上都 AA 通過 */}
    <div className="absolute inset-0 bg-black/30 pointer-events-none" aria-hidden />
    <div className="relative flex flex-col items-center gap-2 text-on-emphasis">
      <Icon size={32} strokeWidth={1.75} />
      <span className="text-body font-medium">{label}</span>
    </div>
  </div>
)
