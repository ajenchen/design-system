/**
 * avatar-stack-overflow — Deterministic SSOT primitive for avatar stack overflow math
 *
 * **2026-05-15 Bug 3 fix(Claude+Codex Step 5 比稿 consensus,user verbatim「就 A」)**:
 *
 * Real root cause of Bug 3「same cell width but different overflow timing per total count」:
 *   1. `useOverflowCount` 在 Combobox 用 DOM `offsetWidth` 量測 + `overflowW = 60` fallback(實際 24px)
 *   2. `overflowEl` 不被 ResizeObserver observe,first calc 用 fallback 後不會 recalc
 *   (1)(2) 在一般文字 Tag 那條路當時沒修,一直留到 2026-10-13 —— DataTable 標籤格一點就變「+2」(待辦 Q1)才在
 *    `../OverflowIndicator/overflow-tag-list.tsx` 拆掉:「+N」恆渲染、量真的寬,也被觀察。頭像堆疊仍走本檔公式。
 *   3. `offsetWidth` 不減 overlap(當時 `-ml-0.5`) → measurement 偏保守
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

import { AVATAR_STACK_OVERLAP_PX } from '@/design-system/components/Avatar/avatar'
import { OVERFLOW_INDICATOR_CIRCLE_PX } from '@/design-system/components/OverflowIndicator/overflow-indicator'

/**
 * Pure deterministic visible-count formula for avatar stack with overlap + overflow chip.
 *
 * @param availablePx — Container width available for the entire stack(含 +N chip 預留空間)
 * @param total — Total avatars in selection
 * @param avatarPx — Per-avatar pixel width(包含 ring border)
 * @param overlapPx — Negative margin overlap between siblings(default = `AVATAR_STACK_OVERLAP_PX`,CSS 雙生 `--avatar-stack-overlap`)
 * @param overflowChipPx — Width reserved for +N indicator when overflow needed(default 24px = circle h-6 min-w-6)
 * @returns visible count(0 ≤ visible ≤ total)。若全部 fit 則 visible = total(無 +N chip);否則 visible 為 max fit。
 */
export function getAvatarStackVisibleCount({
  availablePx,
  total,
  avatarPx,
  // 疊的量只有一個住所:avatar.tsx `AVATAR_STACK_OVERLAP_PX`(2026-09-26 頭像堆疊挖空起)
  overlapPx = AVATAR_STACK_OVERLAP_PX,
  // NOTE: overflowChipPx is kept for backward-compat API but the slot-based
  // formula below treats chip = avatar physical size(both circles same shape
  // + same -ml-0.5 overlap when stacked)。Consumer 必 ensure 視覺 chip wrapper
  // 也套同 `-ml-[var(--avatar-stack-overlap)]` overlap class(Combobox `overflowWrapperClassName`)。
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
  //   avatar 跟 +N 都是同尺寸圓形 + 同 `--avatar-stack-overlap` overlap → 同 step。空間 W 容
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
 * 人員頭像每個尺寸的直徑(px)—— 與 Tag 高度對齊:sm=20px, md/lg=24px(對齊 item-anatomy AVATAR_SIZE.inline)。
 * 這裡是唯一住所:person-display.tsx 的 `AVATAR_PX` 直接指向它(2026-09-27 前兩檔各寫一份,M17)。
 */
export const AVATAR_STACK_AVATAR_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 20,
  md: 24,
  lg: 24,
}

/**
 * +N 圓的直徑 = OverflowIndicator circle 形狀自己的尺寸(唯一住所在 overflow-indicator.tsx),
 * 不再另抄一份(2026-09-27 前是第三份同值)。堆疊契約「同尺寸」讓它與 AVATAR_STACK_AVATAR_PX 逐尺寸相等。
 */
export const AVATAR_STACK_OVERFLOW_CHIP_PX = OVERFLOW_INDICATOR_CIRCLE_PX

/** 外框開銷的快取:同一次量測生命週期(一個 effect)裡量一次就夠,外框的 padding / 邊框 / 同排的箭頭與清除鈕不隨欄寬變。 */
export interface StackChromeCache { chromePx: number | null }

/**
 * 頭像堆疊「被分配到的寬」—— **不隨畫了幾顆變**(view 與 edit 兩條路徑共用這一支,2026-10-28 前 edit 另量自己那一格)。
 *
 * 依內容寬(`width="hug"`)的欄位外框是 `w-fit`,寬度由內容決定:量外框、或量外框裡那一格,都是在量自己的輸出 ——
 * 少畫一顆 → 變窄 → 再少畫一顆,最後停在「1 顆 + +N」(2026-09-07 B1 在檢視態拆過;編輯態一直沒拆,r-F3 缺陷 K:
 * 依內容寬的編輯欄位 2 人只剩「+2」、6 人只畫 4 顆)。拆法是找一個不隨內容變的量:
 *     可用寬 = 外框所在容器的寬 − 外框開銷
 *     外框開銷 = 外框現在的寬 − 這一格的內容寬
 * 兩個減數在同一幀量,內容多寡同時影響兩者、相減抵消。填滿寬時與「量這一格的內容寬」逐像素相同(外框寬由容器決定);
 * 沒有 Field 外框(找不到 `[data-field-mode]`)時就是這一格的內容寬(那時這一格的寬由外層決定)。
 * 「這一格的內容寬」扣掉它自己的 padding(編輯態那一格帶焦點框的留位內距)。
 * 回 0 = 版面還沒好(呼叫端不要拿 0 去算,會鎖進收縮態)。
 */
export function measureStackAvailablePx(slot: HTMLElement, cache: StackChromeCache): number {
  const slotContentW = () => {
    const cs = getComputedStyle(slot)
    return slot.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
  }
  const wrapper = slot.closest<HTMLElement>('[data-field-mode]')
  const containingBlock = wrapper?.parentElement ?? null
  if (!wrapper || !containingBlock) return Math.max(0, slotContentW())
  // 先用一次便宜的讀取確認版面好了沒;外框開銷快取後,之後每次只讀這一個整數(DataTable 一次欄寬變動會喚醒視窗內每一格,2026-09 CPU 剖析)
  const rawAvail = containingBlock.clientWidth
  if (rawAvail <= 0) { cache.chromePx = null; return 0 }
  if (cache.chromePx === null) cache.chromePx = wrapper.getBoundingClientRect().width - slotContentW()
  return rawAvail - cache.chromePx
}
