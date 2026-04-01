import type { LucideIcon } from 'lucide-react'

// ── Field Mode ───────────────────────────────────────────────────────────────

export type FieldMode = 'edit' | 'readonly' | 'disabled'

// ── Inline Action ────────────────────────────────────────────────────────────
// 宣告式 API：消費者只宣告 intent，Field 根據 size tier 自動渲染。
// 見 uiSize.spec.md 的 Inline Action 段落。

export interface InlineActionConfig {
  icon: LucideIcon
  /** aria-label，同時作為 tooltip 來源 */
  label: string
  onClick: () => void
}
