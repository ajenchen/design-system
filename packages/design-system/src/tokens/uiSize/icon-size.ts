/**
 * Icon Size SSOT — cross-domain re-export entry
 *
 * Owner:`packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx:66` `ICON_SIZE`
 * Spec:`packages/design-system/src/tokens/uiSize/uiSize.spec.md` 「Icon Size Tier」段
 *
 * ── 為什麼 re-export 不直接動 owner ──
 * `ICON_SIZE` const codified in `item-anatomy.tsx` 是 row primitive SSOT(MenuItem / TreeView /
 * Sidebar / DropdownMenu / SelectionItem / Item-anatomy 等 row-based primitives 消費)。
 *
 * Form control(Button / Input / Combobox / DatePicker / Tabs / Select / SegmentedControl 等)
 * 不該 cross-domain import patterns/element-anatomy(會造成 components→patterns 反向 dependency
 * 增加 cycle 風險)。透過 `tokens/uiSize/` 作 token home 是 cross-domain SSOT 的慣例(token 是 DS
 * 內最底層,所有 layer 都可 consume 不違反 dependency direction)。
 *
 * ── Tier ──
 * `field-height-xs / sm / md` → icon **16px**
 * `field-height-lg`           → icon **20px**
 *
 * 詳 spec L132+ Icon Size Tier 段(stroke 下限 12px / Tag-Field 配對 / etc.)
 *
 * ── Consumer 用法 ──
 * ```tsx
 * import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
 *
 * // sm/md → 16, lg → 20
 * <LucideIcon size={ICON_SIZE[size]} />
 *
 * // form control xs(field-height-xs 24)用 ICON_SIZE.sm(同 16,per spec L132 Tier)
 * <LucideIcon size={size === 'xs' ? ICON_SIZE.sm : ICON_SIZE[size]} />
 * ```
 *
 * ── 防漂移 ──
 * 1. uiSize.spec.md「Icon Size Tier」段 codify 16/16/16/20 tier(text-based canonical)
 * 2. 本 const 程式化 SSOT(type-safe Record<RowSize, number>)
 * 3. Audit Dim「Icon size literal compliance」DS-wide audit-time scan(write-time hook 尚未實作 — 改靠 audit-time + mindset)
 *
 * ── Carve-out(不適用本 SSOT)──
 * - `rating.spec.md` Rating star 20/24/24(identity scale,cite Ant/Material/Airbnb)
 * - `avatar.spec.md` Avatar 內 icon `round_even(size × 0.6)`(Material/Apple HIG)
 * - `empty.tsx` Empty 用 Avatar 48 wrap → icon 28(Avatar formula derived)
 * - `file-viewer.tsx` thumb 64 → icon 20(thumbnail file-type indicator,hardcode 無公式)
 * - `circular-progress.tsx` `strokeWidth = max(2, size/10)`(stroke ring 厚度公式,非 icon)
 * - `steps.tsx` INDICATOR_ICON_SIZE `{sm:0, md:16, lg:20}`(部分對齊 tier,sm 因圓圈 8px 太小)
 * - `slider.tsx` thumb 固定不隨 size 變(視覺 single tier)
 * - `checkbox.tsx` + `switch.tsx` check `{sm:12, md:12, lg:16}`(form-control internal,stroke 下限)
 *
 * 詳 uiSize.spec.md「跨 regime pointer index」段。
 */
export { ICON_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'
export type { RowSize } from '@/design-system/patterns/element-anatomy/item-anatomy'
