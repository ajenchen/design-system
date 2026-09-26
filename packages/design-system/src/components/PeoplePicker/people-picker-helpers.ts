// PeoplePicker — pure helpers extracted from `people-picker.tsx`(2026-05-18 file-size refactor)
//
// 抽出原因:`people-picker.tsx` 達 P1 file-size budget (500 lines)。本檔收 **不消費 component
// closure** 的純 helper（constant / pure function），讓主檔 ≤ 480。視覺 / behavior /
// user-facing API 完全未動 — 只是 module-level 邊界搬家。
//
// SSOT-bearing render logic(tagRenderer / selectedItemRenderer / 多人 stack 視覺等）仍留在
// `people-picker.tsx`,因為消費 Combobox / Select / state 等 closure。
//
// Hook `check_peoplepicker_ssot_drift.sh` 不檢查本檔 literal — 因規則 cite spec.md row 的義務
// 在主檔 SSOT-bearing API 邊界處,本檔屬機械搬移。
import { nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
import type { SelectOption } from '@/design-system/components/Select/select'
import { buildPersonProfileCard, resolvePerson, type PersonValue } from './person-display'

// ── Tag wrapper className SSOT ──────────────────────────────────────────────
//
// **2026-05-15 Bug 1 fix(Claude+Codex Step 5 比稿 consensus)**:length=1 走 PersonDisplay
// (avatar+人名+ellipsis,per spec.md §C row 1)需要 width constraint chain;length>=2 走
// PersonAvatarTag stack overlap(per spec.md §D row 1)需要 negative margin overlap visual。
// 一個 static wrapper class 涵蓋兩 contract 不可能 — Combobox `OverflowTagList` 把 result 包
// `shrink-0`,如果 wrapper 還疊 `inline-flex` 就 intrinsic content-width → PersonDisplay
// truncate 無效(Bug 1 user 抓「越界蓋 indicator」)。
//
// **Why centralize**:M14 mechanical guard against future drift。任何人未來改 stack mode 邏輯,
// 必經此 helper(hook `check_peoplepicker_ssot_drift.sh` 攔接 wrapper class literal in tsx)。
//
// **2026-05-15 SSOT alignment**(user verbatim「單選 people picker 沒壞,難道沒有 SSOT?」):
// 單選 picker wrapper(`select.tsx:244` selectedItemRenderer wrapper)= `flex-1 min-w-0 inline-flex items-center +
// nakedCellRowModeAlign` — proven working,canonical SSOT。本 helper 對齊 single SSOT,
// **不**自定一套(spec.md §C row 1 +「length=1 視覺 = 跟單人 closed 一致」+ §E「PersonDisplay
// 共享 renderer」)。
//
// `inline-flex items-center` 提供:wrapper 對 PersonDisplay flex container 適當 vertical centering,
//   不靠外層 tagArea items-center cascade(避免 wrapper 高度 collapse 不可控)。
// `nakedCellRowModeAlign` 提供:autoRow cell 內 first-line align(對齊既有 row geometry SSOT)。
//
// **禁加 overflow-hidden**:inner `<span truncate>` 自帶 overflow-hidden + text-overflow:ellipsis,
//   wrapper overflow-hidden 反而 clip 24px avatar(ItemPrefix h-[1lh]~20px slot 容不下)+ break inner
//   ellipsis trigger(圖一 + 圖二 root cause)。

// code-quality-allow: dead-export — SSOT primitive 公開供 future cross-file 消費 + hook
// `check_peoplepicker_ssot_drift.sh` enforce wrapper class literal pattern
export const PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS = `flex-1 min-w-0 inline-flex items-center ${nakedCellRowModeAlign}`

// code-quality-allow: dead-export — paired helper for SSOT primitive(同上 hook + future use rationale)
export function getPeoplePickerTagWrapperClass(selectedCount: number): string {
  return selectedCount === 1
    ? PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS  // SSOT aligned to single picker wrapper(select.tsx:244 selectedItemRenderer wrapper)
    // length>=2 stack 視覺(spec.md §D row 1):圓形 avatar overlap + group/avatar selector for dismiss overlay。
    // `-ml-0.5` = 2px = avatar.tsx `AVATAR_STACK_OVERLAP_PX`(class 字串要給 Tailwind 掃,不能拼常數;改疊量時兩處同改)。
    // 疊放順序與「聚焦時升到最上層」由 Combobox 的 tag wrapper 負責(combobox.tsx `--tag-stack-z`)。
    : '-ml-0.5 first:ml-0 relative inline-flex group/avatar'
}

// ── Person → SelectOption mapping ───────────────────────────────────────────
//
// Issue 4(2026-05-10):forward person 的 description + avatar 給 Select(SelectOption schema
// 已 unified with SelectMenuOption per Issue 4)。先前 PeoplePicker single mode 透過 Select 開
// menu 時 dropdown row 只顯純文字 name(資訊弱)— 現透過 wrapper schema unify 直接帶 avatar /
// description 給 SelectMenu primitive 渲。
//
// 2026-05-18 fix(per user directive「所有 avatar hover 都要 ProfileCard」+ avatar.spec.md
// DS-wide canonical):dropdown menu items Avatar 必帶 hoverCard,跟 PersonDisplay / Tag
// avatar 對齊。漏掉 = user 抓「PeoplePicker 選單內 avatar 沒有 namecard」。
export function personToSelectOption(person: PersonValue): SelectOption {
  const p = resolvePerson(person)
  return {
    value: p.name,
    label: p.name,
    avatar: { src: p.avatarUrl, alt: p.name, hoverCard: buildPersonProfileCard(p) },
    description: p.description,
  }
}

export function findPerson(people: PersonValue[], name: string): PersonValue {
  return people.find(p => resolvePerson(p).name === name) ?? name
}
