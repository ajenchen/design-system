// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @placeholder-vocabulary-allow: 1-cycle backward-compat — `placeholder` 已加(trigger empty SSOT),`emptyPlaceholder={emptyText}` forward 仍保留讓既有 consumer 不被 silent break;Combobox line 760 `placeholder ?? emptyPlaceholder` fallback → placeholder 永遠 takes precedence。Future cycle 移除 emptyPlaceholder forward(per field-controls.spec.md 共享 contract b)。
// @cell-metric-escape-allow: comment describes RETIRED `tagAreaPaddingLeftPx={8}` magic — current code is surface-guarded (`surface === 'form'` only injects `!px-3`; table-cell context untouched, lets naked `!px-[var(--table-cell-px)]` SSOT take over). Hook regex grep'd the comment word, not the live code path. Per (a) fix 2026-05-13 user-approved Path a.
import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY, nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
import { ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { useFieldSurface, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant } from '@/design-system/components/Field/field-context'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Tag } from '@/design-system/components/Tag/tag'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PersonDisplay, MultiPersonDisplay, PersonAvatarTag, buildPersonProfileCard, resolvePerson, type PersonValue } from './person-display'
import {
  getAvatarStackVisibleCount,
  AVATAR_STACK_AVATAR_PX,
  AVATAR_STACK_OVERFLOW_CHIP_PX,
} from './avatar-stack-overflow'
// Pure helpers extracted to sibling for file-size budget(2026-05-18,P1 ≤ 500 lines)。
// 不消費 component closure 的純 constant / 純 mapping function 全部搬走,主檔保留 SSOT-bearing
// render logic(消費 Combobox / Select / state 等 closure 的部分)。
// SSOT primitive re-export(backward-compat 對外 import 路徑保持 `./people-picker`)。
import {
  PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS,
  getPeoplePickerTagWrapperClass,
  personToSelectOption,
  findPerson,
} from './people-picker-helpers'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
export { PEOPLE_PICKER_LENGTH1_WRAPPER_CLASS, getPeoplePickerTagWrapperClass }

// ── PeoplePicker ────────────────────────────────────────────────────────────
// **2026-05-07 v15.6 SSOT 重構 v2**:
//
//   - **single mode** wraps `<Select searchable selectedItemRenderer>`
//   - **multi mode** 兩種 displayMode(consumer 自選),**皆 wrap `<Combobox>`**(同 SSOT,
//     差別在 tagRenderer 視覺):
//       - **'stack'**(default,baseline 既有視覺)— Avatar 疊合 + `+N` overflow indicator,
//         不可 wrap。tagRenderer 渲染 avatar stack(visible count 走 shared `avatar-stack-overflow`
//         primitive deterministic formula,2026-05-15 Bug 3 fix;display 路徑 `<MultiPersonDisplay>` 同 primitive)。
//         對齊 Notion / Linear / Atlassian / Slack 多人 quick-glance idiom。
//       - **'pill'**(opt-in)— 每人 Tag pill,可 wrap。Wrap `<Combobox tagRenderer>`,
//         tagRenderer 用 Tag 元件 `avatar` prop SSOT(不塞 children)。
//         `pillShowAvatar` 控 pill 內是否顯 avatar prefix(default true,false → 純文字 pill)。
//         對齊 GitHub Reviewers / Combobox tag-input idiom。

// **codex P2 fix(2026-05-07 v15.10)**:`extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>`
// 讓 consumer 可傳 `id` / `data-testid` / `onBlur` / `onFocus` / `aria-*` 等 HTML root props,
// component 內部 `...rest` forward 到 trigger 容器(對齊 DS 既有 Combobox / Select 慣例)。
// `onChange` 衝突走 Omit(本 component 用 PersonValue[] custom signature)。
export interface PeoplePickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Field mode(edit / display / readonly / disabled),默認 inherit Field context 或 'edit' */
  mode?: FieldMode
  /** Field chrome variant(對齊 Select / Combobox)*/
  variant?: FieldVariant
  size?: 'sm' | 'md' | 'lg'
  /** 當前已選的人(單選 PersonValue,多選 PersonValue[])*/
  value?: PersonValue | PersonValue[] | null
  /** 值變更 callback(永遠 emit array — single mode 取 [0] 即 single value)*/
  onChange?: (value: PersonValue[]) => void
  /** 可選人員清單(edit mode 下拉顯示)*/
  people?: PersonValue[]
  /** 2026-05-12 Stream C Issue 4 fix(codex Q3 Cluster C):trigger empty placeholder。
   *  Default '請選擇人員'。**禁** 將 `emptyText`(search-empty)當 trigger placeholder 傳。 */
  placeholder?: string
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 搜尋無結果訊息(filtered menu empty)。**僅**用於 SelectMenu noResultsText,
   *  不再 silent 轉 trigger placeholder(2026-05-12 Issue 4 semantic fix)。 */
  emptyText?: string
  className?: string
  disabled?: boolean
  /** Initial open state(uncontrolled)*/
  defaultOpen?: boolean
  /** open state 變更 callback */
  onOpenChange?: (open: boolean) => void
  /**
   * Multi mode 顯示樣式(default 'stack')。Single mode 此 prop 忽略。
   * - 'stack' — Avatar 疊合 + `+N`(空間省、不可 wrap;default)
   * - 'pill'  — 每人 Tag pill(可 wrap)
   */
  multiDisplay?: 'stack' | 'pill'
  /**
   * `multiDisplay='pill'` 模式下是否顯示 avatar prefix(default true)。
   * 設 false → 純文字 pill,進一步節省空間。對齊 Tag 元件 `avatar` prop SSOT。
   */
  pillShowAvatar?: boolean
  /** Pill 模式下是否允許 wrap(default true)— 對齊 Combobox `wrap` prop */
  pillWrap?: boolean
  /**
   * 搜尋型態(2026-05-12 規則 3 ship,3-mode SSOT 對齊 A1-A5 spec):
   * - `'menu'`(default,backward-compat)— 浮層內搜尋(panel-top search)
   * - `'trigger'`(multi 模式 opt-in)— inline 搜尋(浮層開時 name 拿掉,avatar 後接 input cursor,
   *   類 Combobox inline-trigger idiom)
   * Single mode 永遠 inline-trigger(wrap Select searchable 直接走 inline),此 prop multi 才有意義。
   */
  searchIn?: 'menu' | 'trigger'
  /**
   * Display 是否渲 ChevronDown + Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell display↔edit 像素級對齊用。預設 false(裸 PersonDisplay,backward compat)。
   * 設 true 時 display 走 fieldWrapperStyles(naked variant)+ ItemSuffix ChevronDown,
   * 與 edit (Select / Combobox wrapped) 同 DOM 結構,消除 Layer-B padding mismatch。
   */
  showDisplayEndIcon?: boolean
  /** a11y label */
  'aria-label'?: string
}

const PeoplePicker = React.forwardRef<HTMLDivElement, PeoplePickerProps>(function PeoplePicker({
  mode: modeProp,
  variant: variantProp,
  size: sizeProp,
  value,
  onChange,
  people = [],
  placeholder = '請選擇人員', // i18n-allow: DS default(2026-05-12 Stream C Issue 4)
  searchPlaceholder = '搜尋人員…', // i18n-allow: DS default
  emptyText = '沒有符合的人員', // i18n-allow: DS default — only for SelectMenu noResultsText
  className,
  disabled: disabledProp,
  defaultOpen = false,
  onOpenChange,
  multiDisplay = 'stack',
  pillShowAvatar = true,
  pillWrap = true,
  searchIn = 'menu',
  showDisplayEndIcon = false,
  'aria-label': ariaLabel,
  ...rest
}, ref) {
  const surface = useFieldSurface()
  const size = useResolvedFieldSize(sizeProp)  // B 組 cascade fix
  const disabled = useResolvedFieldDisabled(disabledProp)
  // 2026-06-08 SSOT:mode/disabled/variant 統一經 helper;修 <Field disabled> 漏 cascade(原只讀 fieldCtx.mode)
  const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled })
  const resolvedVariant: FieldVariant = useResolvedFieldVariant(variantProp)
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  // ── mode='display' ────────────────────────────────────────────────────────
  // Default(showDisplayEndIcon=false):裸 PersonDisplay / MultiPersonDisplay — backward compat。
  // Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper + ItemSuffix ChevronDown,
  // 與 edit (Select / Combobox wrapped) 同 DOM 結構消除 cell display↔edit 像素偏移。
  if (resolvedMode === 'display') {
    if (!showDisplayEndIcon) {
      if (isEmpty) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
      return isMulti
        ? <MultiPersonDisplay value={value as PersonValue[]} size={size} measured />
        : <PersonDisplay value={value as PersonValue} size={size} />
    }
    // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: 'display', variant: resolvedVariant, size }), className)}
        data-field-mode="display"
      >
        <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign)}>
          {isEmpty
            ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            : isMulti
              ? <MultiPersonDisplay value={value as PersonValue[]} size={size} measured />
              : <PersonDisplay value={value as PersonValue} size={size} />}
        </span>
        <ItemSuffix className="pointer-events-none">
          <ChevronDown size={iconSize} className="shrink-0 text-fg-muted" aria-hidden />
        </ItemSuffix>
      </div>
    )
  }

  // ── readonly / disabled — Field wrapper chrome,Avatar 視覺保留 ───────────
  if (resolvedMode !== 'edit') {
    return (
      <div
        ref={ref}
        className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
        data-field-mode={resolvedMode}
        aria-disabled={resolvedMode === 'disabled' ? true : undefined}
        aria-label={ariaLabel}
        {...rest}
      >
        <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign, resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {isEmpty
            ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            : isMulti
              ? <MultiPersonDisplay value={value as PersonValue[]} size={size} measured />
              : <PersonDisplay value={value as PersonValue} size={size} />}
        </span>
        {/* 2026-06-10 類型身份 indicator:readonly/disabled 保留 chevron(naked cell 依 showDisplayEndIcon);disabled → fg-disabled */}
        {(resolvedVariant === 'naked' ? showDisplayEndIcon : true) && (
          <ItemSuffix className="pointer-events-none">
            <ChevronDown size={ICON_SIZE[size as 'sm' | 'md' | 'lg']} className={cn('shrink-0', resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted')} aria-hidden />
          </ItemSuffix>
        )}
      </div>
    )
  }

  // ── edit mode ─────────────────────────────────────────────────────────────
  const selectedNames: string[] = !value
    ? []
    : Array.isArray(value)
      ? value.map(v => resolvePerson(v).name)
      : [resolvePerson(value).name]

  // ── single mode → wraps Select ────────────────────────────────────────────
  if (!isMulti) {
    const handleSingleChange = (name: string) => onChange?.([findPerson(people, name)])
    return (
      <Select
        ref={ref as React.Ref<HTMLDivElement>}
        size={size}
        variant={resolvedVariant}
        options={people.map(personToSelectOption)}
        value={selectedNames[0] ?? null}
        onChange={handleSingleChange}
        searchable
        placeholder={placeholder}
        // 2026-05-12 Stream C Issue 4 fix(codex Q3):傳 `placeholder` 給 Select trigger empty。
        // 不再傳 `emptyText`(search-empty semantic 跟 trigger-empty 分離,canonical SSOT)。
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        className={className}
        aria-label={ariaLabel}
        selectedItemRenderer={(opt) => <PersonDisplay value={findPerson(people, opt.value)} size={size} />}
        // **codex P2 forward**:Select extends `SelectHTMLAttributes<HTMLSelectElement>`,
        // event handler element 型別跟 PeoplePicker `HTMLAttributes<HTMLDivElement>` 不一致
        // (`onCopy` / `onChange` 等)。Runtime spread 等效 — DOM 收到 attrs 不挑剔。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // any-allow: rest 含 `onChange: FormEventHandler` 跟 Select onChange signature 衝突 — DOM runtime spread 安全(per codex P2 forward)
        {...(rest as any)}
      />
    )
  }

  // ── multi 'pill' → wraps Combobox(對齊 GitHub Reviewers / Combobox idiom)────
  if (multiDisplay === 'pill') {
    const handleMultiChange = (next: string[]) => {
      onChange?.(next.map(name => findPerson(people, name)))
    }
    return (
      <Combobox
        ref={ref as React.Ref<HTMLDivElement>}
        size={size}
        variant={resolvedVariant}
        options={people.map(personToSelectOption)}
        value={selectedNames}
        onChange={handleMultiChange}
        searchable
        searchPlaceholder={searchPlaceholder}
        // 2026-05-12 Stream C Issue 4(codex Q3):placeholder = trigger empty hint('請選擇人員')
        // — semantic clean separation;emptyText 不再 silent 轉 trigger placeholder。
        // emptyPlaceholder backward-compat forward(Combobox line 760 `placeholder ?? emptyPlaceholder` fallback)
        // 1 cycle:future 移除 emptyPlaceholder forward,emptyText 改傳 SelectMenu noResultsText。
        placeholder={placeholder}
        emptyPlaceholder={emptyText}
        wrap={pillWrap}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        className={className}
        aria-label={ariaLabel}
        // codex P2 forward(see Select branch comment for type-cast rationale)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // any-allow: rest 含 `onChange: FormEventHandler` 跟 Combobox onChange signature 衝突 — DOM runtime spread 安全(per codex P2 forward)
        {...(rest as any)}
        // **Tag SSOT canonical**:用 `avatar` prop(不塞 children),Tag 內部統一
        // wrap 進 16×16 圓形 mask container(per Tag tsx line 175)。
        tagRenderer={(item, onRemove) => {
          const p = resolvePerson(findPerson(people, item.value))
          return (
            <Tag
              key={item.value}
              size={size}
              color="neutral"
              // 2026-05-18 7B' fix(per user 拍板「執行」+ Codex Round 3 共識,paired with Combobox L286):
              // 拿掉 `unbounded` 對齊 Tag canonical max-w-40 cap + 內建 ellipsis。PeoplePicker pill 走
              // Combobox tagRenderer slot,SSOT = Tag primitive 視覺(per codex Round 3 verdict)。
              // 人名 99% < 25 chars 不觸發 cap;極端長名(複數姓 + middle name)觸發 ellipsis 是合理 UX。
              avatar={pillShowAvatar
                ? <Avatar src={p.avatarUrl} alt={p.name} size={16} hoverCard={buildPersonProfileCard(p)} />
                : undefined}
              onRemove={onRemove}
            >
              {p.name}
            </Tag>
          )
        }}
      />
    )
  }

  // ── multi 'stack' (default) → wraps Combobox 跟 pill mode 同 SSOT,差別在 tagRenderer 視覺。
  //
  // **2026-05-15 Bug 3 fix(Claude+Codex Step 5 比稿 consensus)**:visible count 走 shared
  // `avatar-stack-overflow` primitive deterministic formula(取代 Combobox DOM offsetWidth-based
  // useOverflowCount + 60px fallback 不 deterministic),pass override 給 Combobox bypass internal
  // measurement。`MultiPersonDisplay`(display path)同 primitive,display + edit 結果一致。
  // 對齊 user verbatim SSOT「同 cell width 同 overflow 判斷」+ codex Q3 consensus shared primitive。
  const handleMultiChange = (next: string[]) => {
    onChange?.(next.map(name => findPerson(people, name)))
  }
  // SSOT visible count compute via formula primitive + ResizeObserver
  const stackContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [stackVisibleCount, setStackVisibleCount] = React.useState<number | undefined>(undefined)
  React.useLayoutEffect(() => {
    // 注:此 effect 只在 multi stack mode 跑(early return if not stack);length<=1 不需 override
    if (!isMulti || selectedNames.length <= 1) {
      setStackVisibleCount(undefined); return
    }
    const root = stackContainerRef.current
    if (!root) return
    // 2026-05-15 ROOT CAUSE FIX(user 抓「之前說的問題都還是存在」):
    // stackContainerRef 透過 mergedStackRef 接 Combobox forwarded ref → root **就是** [role=combobox]
    // div 自己。原 `root.querySelector('[role=combobox]')` 不找 self 永遠 null → trigger=null →
    // tagArea=null → available=0 → setStackVisibleCount(0) → 整 stack 全 overflow → fallback 到
    // Combobox DOM-based useOverflowCount(非 deterministic 那個算法)。修:用 root 自己當 trigger,
    // 從 root 內找 tagArea(flex-1 min-w-0 div)。
    const calc = () => {
      const trigger = root.matches('[role="combobox"]') ? root : root.querySelector<HTMLElement>('[role="combobox"]')
      const tagArea = trigger?.querySelector<HTMLElement>('div[class*="flex-1"][class*="min-w-0"]')
      const available = tagArea?.clientWidth ?? trigger?.clientWidth ?? 0
      const visible = getAvatarStackVisibleCount({
        availablePx: available,
        total: selectedNames.length,
        avatarPx: AVATAR_STACK_AVATAR_PX[size],
        overflowChipPx: AVATAR_STACK_OVERFLOW_CHIP_PX[size],
      })
      setStackVisibleCount(visible)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(root)
    return () => ro.disconnect()
  }, [isMulti, multiDisplay, selectedNames.length, size])
  // Merge ref:forward to parent + capture for ResizeObserver
  const mergedStackRef = React.useCallback((el: HTMLDivElement | null) => {
    stackContainerRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el
  }, [ref])

  return (
    <Combobox
      ref={mergedStackRef}
      size={size}
      variant={resolvedVariant}
      options={people.map(personToSelectOption)}
      value={selectedNames}
      onChange={handleMultiChange}
      searchable
      searchIn={searchIn}
      searchPlaceholder={searchPlaceholder}
      // 2026-05-12 Stream C Issue 4(codex Q3):placeholder = trigger empty('請選擇人員');emptyText = search-empty(僅 backward-compat forward 1 cycle)
      placeholder={placeholder}
      emptyPlaceholder={emptyText}
      wrap={false}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      // 2026-05-13 (a) fix(user 拍 Path a + Layer A density-drift root-cause):
      // 撤掉 `tagAreaPaddingLeftPx={8}` magic — Combobox `tagPadding[size]` 是 density-dependent
      // calc 公式(`(field-height - icon-size) / 2`),只在 md size + default density 才 = 4px;
      // 其他 size/density 漂 6px / 8px → 4+8=12 spec 公式不成立。
      // (a) fix:form context + 有 tag → 改 inject `!px-3`(固定 12px)直接 override `tagPadding[size]`,
      // 達成 GitHub PeoplePicker fixed 12px inset(對齊 cell context 同 13px from cell.left 含 1px border)。
      // - form + 有 tag → `!px-3`(12px 固定 inset)+ tagAreaPaddingLeftPx undefined → field.padL=12 ✓
      // - table-cell + 有 tag → naked variant `!px-[var(--table-cell-px)]` 已是 12px,不 inject ✓
      // - isEmpty → 不 inject,走 Combobox 預設文字 inset(`tagPadding[size]` 公式自然 vertical center)
      className={cn(className, !isEmpty && surface === 'form' && '!px-3')}
      aria-label={ariaLabel}
      // 2026-05-15 Bug 1 fix(Claude+Codex Step 5 比稿 consensus,user verbatim「就 A」):per-length 動態
      // wrapper class — length=1 降階單人視覺需要 width constraint chain(`flex-1 min-w-0 overflow-hidden`),
      // length>=2 stack 視覺保留 overlap(`-ml-0.5 first:ml-0 relative inline-flex group/avatar`)。對齊
      // spec.md §C row 1(length=1 = avatar+人名+ellipsis)+ §D row 1(length>=2 = stack overlap)。
      // 真根因:Combobox `OverflowTagList` 把所有 tagRenderer 結果包 `shrink-0`,加 `inline-flex` 後
      // wrapper 變 intrinsic content-width → PersonDisplay `w-full` resolves to intrinsic → truncate 無效。
      // 修法:length=1 wrapper 改 `flex-1 min-w-0 overflow-hidden` 提供 width constraint 給 PersonDisplay。
      // SSOT helper `getPeoplePickerTagWrapperClass(count)` 集中,future 改 wrapper 行為改一處。
      tagWrapperClassName={getPeoplePickerTagWrapperClass(selectedNames.length)}
      // 2026-05-16 真 root cause fix:overflow chip wrapper 套同 `-ml-0.5` 讓 chip 物理上
      // 跟 avatar 同 slot(等寬同 step,non-overlapping 多 24px 區塊不再 saw)。對齊 user
      // 「avatars 和 +N 都是同尺寸圓形,空間最多容固定數量圓形」物理模型 directive +
      // MUI AvatarGroup / Primer AvatarStack 共識(`AvatarGroup.js` L54-59 same negative margin)。
      overflowWrapperClassName="-ml-0.5 first:ml-0 relative inline-flex"
      tagAreaGapPx={0}
      tagAreaPaddingLeftPx={undefined}
      // 2026-05-12 Round 7 fix(user 抓 image 2「+N tag 應該圓形不是矩形」+ 對齊 GitHub picker idiom):
      // Combobox default `overflowShape='tag'`(矩形 chip,文字 Combobox 慣例);PeoplePicker stack
      // mode pass `'circle'`(圓形 avatar-shape,跟 avatar 一樣大)。對齊 MultiPersonDisplay readonly path
      // 既有 OverflowIndicator default 'circle' SSOT。
      overflowShape="circle"
      // 2026-05-15 Bug 3 fix:formula-based visible count override(避免 Combobox DOM measurement +
      // 60px fallback 不 deterministic)。SSOT in `./avatar-stack-overflow.ts`,display + edit 共用。
      visibleCountOverride={stackVisibleCount}
      // 2026-05-14 I4 fix(per codex+Layer A 共識):hidden items 在 `+N` overflow popover 顯
      // Tag with avatar(對齊 display MultiPersonDisplay popover SSOT,user 抓 display vs edit
      // overflow 視覺不一致)。
      renderHiddenTag={(item) => {
        const p = resolvePerson(findPerson(people, item.value))
        return (
          <Tag
            key={item.value}
            color="neutral"
            size="sm"
            avatar={
              <Avatar
                src={p.avatarUrl}
                alt={p.name}
                size={16}
                hoverCard={buildPersonProfileCard(p)}
              />
            }
            onRemove={() => {
              onChange?.(selectedNames.filter(n => n !== item.value).map(n => findPerson(people, n)))
            }}
          >
            {p.name}
          </Tag>
        )
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // any-allow: rest 含 `onChange: FormEventHandler` 跟 Combobox onChange signature 衝突 — DOM runtime spread 安全(per codex P2 forward)
      {...(rest as any)}
      tagRenderer={(item, onRemove) => {
        const p = resolvePerson(findPerson(people, item.value))
        // 2026-05-12 Q2 fix(user 拍板「multi 只選 1 人時 trigger = avatar + name,跟 single mode 同」):
        // selectedNames.length === 1 → PersonDisplay(avatar + name)代替 PersonAvatarTag(avatar only)。
        // SSOT 對齊 PeoplePicker single mode line 201 selectedItemRenderer。多選 1 人時視覺等同單選,
        // 只在 length > 1 才走 stack(各 avatar 純 chip)。多選 + inline 搜尋場景拿掉 name 改 cursor
        // 走 `searchIn='trigger'` opt-in(2026-05-12 規則 3 ship,已轉傳 Combobox;default 'menu' 走 panel-top search)。
        if (selectedNames.length === 1) {
          return <PersonDisplay key={item.value} value={p} size={size} />
        }
        return (
          <PersonAvatarTag
            key={item.value}
            person={p}
            size={size}
            onRemove={onRemove}
          />
        )
      }}
    />
  )
})
PeoplePicker.displayName = 'PeoplePicker'

// Story auto-compile metadata
export const peoplePickerMeta = {
  component: 'PeoplePicker',
  family: 4,
  variants: {},
  sizes: {},
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { PeoplePicker }
