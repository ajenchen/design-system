import * as React from 'react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, EMPTY_DISPLAY, nakedCellRowModeAlign } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext } from '@/design-system/components/Field/field-context'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Tag } from '@/design-system/components/Tag/tag'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PersonDisplay, MultiPersonDisplay, PersonAvatarTag, buildPersonNameCard, resolvePerson, type PersonValue } from './person-display'

// ── helpers ─────────────────────────────────────────────────────────────────
function personToSelectOption(person: PersonValue): SelectOption {
  const p = resolvePerson(person)
  return { value: p.name, label: p.name }
}
function findPerson(people: PersonValue[], name: string): PersonValue {
  return people.find(p => resolvePerson(p).name === name) ?? name
}

// ── PeoplePicker ────────────────────────────────────────────────────────────
// **2026-05-07 v15.6 SSOT 重構 v2**:
//
//   - **single mode** wraps `<Select searchable selectedItemRenderer>`
//   - **multi mode** 兩種 displayMode(consumer 自選):
//       - **'stack'**(default,baseline 既有視覺)— Avatar 疊合 + `+N` overflow indicator,
//         不可 wrap。Trigger 自組 + 直接 wrap `<SelectMenu multiple>` primitive,
//         trigger 內 render `<MultiPersonDisplay>` reuse baseline primitive(SSOT)。
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
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 空選項提示 */
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
  /** a11y label */
  'aria-label'?: string
}

const PeoplePicker = React.forwardRef<HTMLDivElement, PeoplePickerProps>(function PeoplePicker({
  mode: modeProp,
  variant: variantProp,
  size = 'md',
  value,
  onChange,
  people = [],
  searchPlaceholder = '搜尋人員…', // i18n-allow: DS default
  emptyText = '沒有符合的人員', // i18n-allow: DS default
  className,
  disabled,
  defaultOpen = false,
  onOpenChange,
  multiDisplay = 'stack',
  pillShowAvatar = true,
  pillWrap = true,
  'aria-label': ariaLabel,
  ...rest
}, ref) {
  const fieldCtx = useFieldContext()
  const mode: FieldMode = modeProp ?? fieldCtx?.mode ?? 'edit'
  const resolvedMode: FieldMode = disabled ? 'disabled' : mode
  const resolvedVariant: FieldVariant = variantProp ?? fieldCtx?.variant ?? 'default'
  const isMulti = Array.isArray(value)
  const isEmpty = !value || (isMulti && value.length === 0)

  // ── mode='display' ────────────────────────────────────────────────────────
  if (resolvedMode === 'display') {
    if (isEmpty) return <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
    return isMulti
      ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
      : <PersonDisplay value={value as PersonValue} size={size} />
  }

  // ── readonly / disabled — Field wrapper chrome,Avatar 視覺保留 ───────────
  if (resolvedMode !== 'edit') {
    return (
      <div
        ref={ref}
        className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
        data-field-mode={resolvedMode}
        aria-label={ariaLabel}
        {...rest}
      >
        <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign, resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {isEmpty
            ? <span className="text-fg-muted">{EMPTY_DISPLAY}</span>
            : isMulti
              ? <MultiPersonDisplay value={value as PersonValue[]} size={size} />
              : <PersonDisplay value={value as PersonValue} size={size} />}
        </span>
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
        // codex P2 fix(2026-05-07):不傳 `placeholder=emptyText`。emptyText 是
        // 「empty results」搜尋無結果訊息,不該當 trigger placeholder。Select 自帶
        // 預設 trigger placeholder,移除這 line 恢復舊行為(「選擇...」trigger 文字)。
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        className={className}
        aria-label={ariaLabel}
        selectedItemRenderer={(opt) => <PersonDisplay value={findPerson(people, opt.value)} size={size} />}
        // **codex P2 forward**:Select extends `SelectHTMLAttributes<HTMLSelectElement>`,
        // event handler element 型別跟 PeoplePicker `HTMLAttributes<HTMLDivElement>` 不一致
        // (`onCopy` / `onChange` 等)。Runtime spread 等效 — DOM 收到 attrs 不挑剔。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        emptyPlaceholder={emptyText}
        wrap={pillWrap}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        className={className}
        aria-label={ariaLabel}
        // codex P2 forward(see Select branch comment for type-cast rationale)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(rest as any)}
        // **Tag SSOT canonical**:用 `avatar` prop(不塞 children),Tag 內部統一
        // wrap 進 16×16 圓形 mask container(per Tag tsx line 175)。
        tagRenderer={(item, onRemove) => {
          const p = resolvePerson(findPerson(people, item.value))
          return (
            <Tag
              key={item.value}
              size={size}
              variant="neutral"
              avatar={pillShowAvatar
                ? <Avatar src={p.avatarUrl} alt={p.name} size={16} hoverCard={buildPersonNameCard(p)} />
                : undefined}
              onDismiss={onRemove}
            >
              {p.name}
            </Tag>
          )
        }}
      />
    )
  }

  // ── multi 'stack' (default) → wraps Combobox 跟 pill mode 同 SSOT,差別只在
  //    tagRenderer 把 Tag pill 換成 Avatar overlap 視覺(2026-05-07 v15.13)。
  //    `wrap=false` 鎖單行;`tagWrapperClassName` 把 overlap (`-ml-0.5`) + group/avatar
  //    parent 拉到 Combobox 內部 measurement wrapper 上 — 既保留 useOverflowCount 量測
  //    必要 wrapper,又達成 sibling-level negative margin overlap + dismiss group selector。
  //    Q2 known tradeoff:`-ml-0.5` 不改 wrapper.offsetWidth → +N indicator 偏保守(視覺
  //    還有空間但已顯 +N)。當前接受;若窄 trigger + 多人嚴重不對,future 可加 `overlapPx` prop。
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
      emptyPlaceholder={emptyText}
      wrap={false}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      className={className}
      aria-label={ariaLabel}
      tagWrapperClassName="-ml-0.5 first:ml-0 relative inline-flex group/avatar"
      tagAreaGapPx={0}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
      tagRenderer={(item, onRemove) => {
        const p = resolvePerson(findPerson(people, item.value))
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
