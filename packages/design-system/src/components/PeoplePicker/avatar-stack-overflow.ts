/**
 * avatar-stack-overflow — Deterministic SSOT primitive for avatar stack overflow math
 *
 * **2026-05-15 Bug 3 fix(Claude+Codex Step 5 比稿 consensus,user verbatim「就 A」)**:
 *
 * Real root cause of Bug 3「same cell width but different overflow timing per total count」:
 *   1. `useOverflowCount` 在 Combobox 用 DOM `offsetWidth` 量測 + `overflowW = 60` fallback(實際 24px)
 *   2. `overflowEl` 不被 ResizeObserver observe,first calc 用 fallback 後不會 recalc
 *   3. `offsetWidth` 不減 `-ml-0.5` overlap → measurement 偏保守
 *   4. **架構違反**:`MultiPersonDisplay` display path 用 canvas-based 算 / Combobox edit path 用 DOM offsetWidth
 *      → 同 cell width 兩 path 不同結果 → user verbatim「同寬 cell overflow 時間不一樣」SSOT 根本被違反
 *
 * **Fix**(per codex Q3 consensus):抽 pure formula + React hook,view + edit 兩 path **共用**。
 *
 * **Deterministic formula**:
 * ```
 * firstAvatar + (visible - 1) * (avatar - overlap) + overflowChip <= available
 * ```
 * - `firstAvatar`:第一個 avatar 全寬 = `avatarPx`
 * - subsequent items:`avatar - overlap`(stack `-ml-0.5` 視覺等同 measurement subtract)
 * - `overflowChip`:若有 hidden,留 +N chip 空間;最後一個 visible item 不需留(`remaining === 0`)
 *
 * **Why centralize**:M14 mechanical guard against future drift。`MultiPersonDisplay` +
 * PeoplePicker stack edit + future avatar consumers 都 import 此 helper,不可 copy formula。
 * 對齊 codex「one avatar-stack primitive owns avatarPx, overlapPx, overflowChipPx」directive。
 *
 * **Benchmark cite**(per codex external baseline):MDN flex truncation / MUI Autocomplete
 * limitTags / Ant Select maxTagCount="responsive"(explicit overflow contract,非 incidental clip)/
 * Primer Truncate(parent-constrained max width)。
 */

/**
 * Pure deterministic visible-count formula for avatar stack with overlap + overflow chip.
 *
 * @param availablePx — Container width available for the entire stack(含 +N chip 預留空間)
 * @param total — Total avatars in selection
 * @param avatarPx — Per-avatar pixel width(包含 ring border)
 * @param overlapPx — Negative margin overlap between siblings(default 2px = `-ml-0.5`)
 * @param overflowChipPx — Width reserved for +N indicator when overflow needed(default 24px = circle h-6 min-w-6)
 * @returns visible count(0 ≤ visible ≤ total)。若全部 fit 則 visible = total(無 +N chip);否則 visible 為 max fit。
 */
export function getAvatarStackVisibleCount({
  availablePx,
  total,
  avatarPx,
  overlapPx = 2,
  // NOTE: overflowChipPx is kept for backward-compat API but the slot-based
  // formula below treats chip = avatar physical size(both circles same shape
  // + same -ml-0.5 overlap when stacked)。Consumer 必 ensure 視覺 chip wrapper
  // 也套同 `-ml-0.5` overlap class(Combobox `overflowWrapperClassName`)。
  overflowChipPx: _overflowChipPx = 24,
}: {
  availablePx: number
  total: number
  avatarPx: number
  overlapPx?: number
  overflowChipPx?: number
}): number {
  if (total <= 0 || availablePx <= 0) return 0
  // 2026-05-16 真 root cause fix(Claude+Codex Round 2 + user 物理模型 directive):
  //
  // 原 formula 雙態 bug:
  //   1. full-fit 路徑算 fullStack(無 chip space)
  //   2. overflow 路徑重算 remainder(chip 當 24px 額外空間)
  //   兩 path 切換時 visible 跳 2(saw)— 因 chip 不被當「stack 內 1 個圓」,
  //   被當「stack 外額外 chunk」。User 抓 length=4→4、length=5→2+3 = 物理錯。
  //
  // **User 物理模型(對齊 MUI AvatarGroup / Primer AvatarStack / Material idiom)**:
  //   avatar 跟 +N 都是同尺寸圓形 + 同 -ml-0.5 overlap → 同 step。空間 W 容
  //   `slots = 1 + floor((W - avatar) / step)` 個圓。total ≤ slots → 全 avatar 無 chip;
  //   total > slots → (slots-1) avatar + 1 chip(共 slots 個圓)。
  //
  // 物理 saw 性質:length 從 slots 跳到 slots+1 時 visible 從 slots 跳到 slots-1
  // = delta 1 avatar(同 slots 個圓,只 swap 最後一個 avatar 變 chip)。對齊 user 直覺。
  const step = avatarPx - overlapPx
  if (step <= 0) return Math.min(total, 1)
  const slots = 1 + Math.floor((availablePx - avatarPx) / step)
  if (slots <= 0) return 0
  if (total <= slots) return total  // 全 fit:每 slot 一個 avatar
  return Math.max(0, slots - 1)  // 超過 slots:slots-1 個 avatar + 1 個 chip(last slot)
}

/**
 * Map size token to avatar pixel(對齊 person-display.tsx:80 AVATAR_PX SSOT)。
 */
export const AVATAR_STACK_AVATAR_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 20,
  md: 24,
  lg: 24,
}

/**
 * Default overflow chip width per size(對齊 overflow-indicator.tsx:17 triggerSize SSOT)。
 * shape='circle' → h-{5|6} min-w-{5|6} ≈ 20-24px
 */
export const AVATAR_STACK_OVERFLOW_CHIP_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 20,
  md: 24,
  lg: 24,
}
