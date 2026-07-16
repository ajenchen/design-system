// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — Select 含 3 子元件(NativeSelect/CustomSelect/ReadonlyDisplay)+ helpers + 4-mode renderer + Field SSOT consumption,split-into-files 會破壞 file-local helper closure
// @renderer-symmetry-allow: 2026-07-08 WM 戰役 A 案回歸修正 — ReadonlyDisplay 現已消費 selectedItemRenderer(view bare-span / D-path / readonly / disabled 四分支),對齊 field-controls.spec.md 共享 contract (a)「view/readonly/disabled/edit 4 mode 共享同一 renderer」。前 note「display→edit unify deferred」已兌現(值內容層);chrome 結構 unify(D-path)仍為 opt-in showDisplayEndIcon。
import * as React from 'react'
import { X, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal, FieldWidth } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, nakedCellRowModeAlign, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { Tag } from '@/design-system/components/Tag/tag'
import { ItemInlineAction, ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid, useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import { SelectMenu, forwardKeyToListbox, useActiveDescendant, type SelectMenuOption } from '@/design-system/components/SelectMenu/select-menu'
import { useIsTouchDevice } from '@/design-system/hooks/use-is-touch-device'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

// ── Tag padding per size ────────────────────────────────────────────────────
const tagPadding: Record<string, string> = {
  sm: 'px-[calc((var(--field-height-sm)_-_1.25rem)_/_2)]',
  md: 'px-[calc((var(--field-height-md)_-_1.5rem)_/_2)]',
  lg: 'px-[calc((var(--field-height-lg)_-_1.5rem)_/_2)]',
}

// ── Display ─────────────────────────────────────────────────────────────────

/**
 * Select 用的 option schema(2026-05-10 Issue 4 + post-prune unify):**explicit extends
 * SelectMenuOption(primitive SSOT)** — 任何 SelectMenuOption 加 field 都自動繼承,不會 drift。
 *
 * Why `extends SelectMenuOption`(per user 「全盤檢查避免下次又改壞或是偏移」要求):
 *   - **schema SSOT 機械強制**:TypeScript inheritance 跟著 primitive 走,wrapper consumer 永遠
 *     拿得到 primitive 所有 surface field
 *   - **Hook lint**(M30 `check_wrapper_primitive_schema_drift.sh`):grep `interface .*Option`
 *     未 `extends` SelectMenuOption / 同名重複 declare 直接 BLOCK
 *
 * Wrapper-only field(`tagVariant`)— Select 獨有 `display='tag'` 用,SelectMenu primitive 不該知道
 * 此 wrapper-only concern,所以 wrapper 層 extend 加上,不污染 primitive。
 *
 * 對齊 Polaris ChoiceList / Material Autocomplete / Carbon Dropdown 的 wrapper-vs-primitive
 * schema-extension idiom。
 */
export interface SelectOption extends SelectMenuOption {
  /** Tag 模式的顏色。只在 display='tag' 時生效,對應 Tag 的 variant。Wrapper-only。 */
  tagVariant?: string
}

/** 分組設定 — 對齊 SelectMenuGroupConfig SSOT */
export interface SelectGroupConfig {
  key: string
  label: string
}

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * 原生 `<select>` 屬性 allowlist(2026-07-14 API 策展 D,user 拍板「全部收窄」)。
 *
 * 舊契約 `extends Omit<SelectHTMLAttributes, ...>` 型別承諾**全部**原生 select 屬性,但桌機
 * 自訂 combobox(div trigger + hidden input mirror)只有部分真生效 — 其餘 silent no-op /
 * 被元件內部覆寫,「型別承諾 ≠ 實作出口」= footgun。改 `Pick<>` 顯式 allowlist,**只承諾
 * 兩路徑(desktop CustomSelect / mobile NativeSelect)皆有實作出口的屬性**,盤點以 code 為準:
 *
 * - `id` — 桌機 trigger div / mobile `<select>`,皆 `idProp ?? fieldCtx?.id`
 * - `name` / `form` / `required` — 桌機經 hidden input mirror(D2 2026-07-13,見 hiddenInputEl
 *   docblock)/ mobile 原生 `<select>` spread
 * - `disabled` — 兩路徑 `useResolvedFieldDisabled` cascade → mode 分流
 * - `className` / `style` — 兩路徑 field wrapper
 * - `onFocus` / `onBlur` — 桌機 rest spread 到 focusable trigger(tabIndex=0)/ mobile spread
 * - `onKeyDown` — 桌機 consumer handler 先跑再走元件導覽(dim-9)/ mobile 原生
 * - `aria-label` / `aria-describedby` / `aria-errormessage` — 兩路徑顯式接線(fieldCtx fallback)
 * - `autoFocus` / `autoComplete` — **mobile-only**:NativeSelect 原生 `<select>` 生效;桌機
 *   custom combobox 無原生對應 = documented no-op(桌機 autofill 由 hidden input mirror 的
 *   option-match onChange guard 承擔)
 * - `data-*` — 兩路徑 spread passthrough(dim-9 契約;index signature 顯式承諾,見下)
 *
 * 被砍者(原 extends 承諾但從未生效 / 被元件覆寫,不再進型別):`multiple` / `children` /
 * `tabIndex`(桌機恆 0)/ `aria-labelledby`(桌機由 fieldCtx.labelId / aria-label 管理,
 * consumer 值會被覆寫)/ 其餘 generic HTMLAttributes(title / dir / onClick 等)。
 * 需要時先接線(兩路徑等效)再入表,**不回 extends 全開**。
 *
 * 世界級對照:自訂 combobox 皆走 curated 原生屬性子集,無人 extends 全部 SelectHTMLAttributes —
 * Radix Select.Root 顯式列舉 name/disabled/required/form/autoComplete
 * (radix-ui.com/primitives/docs/components/select#root)/ Headless UI Listbox name/form/disabled
 * (headlessui.com/react/listbox#using-with-html-forms)/ React Aria Select name/autoComplete/
 * isDisabled/isRequired(react-spectrum.adobe.com/react-aria/Select.html)。
 */
export interface SelectProps
  extends Pick<
    React.SelectHTMLAttributes<HTMLSelectElement>,
    // ── 兩路徑皆真生效 ──
    | 'id' | 'className' | 'style'
    | 'name' | 'form' | 'required' | 'disabled'
    | 'onFocus' | 'onBlur' | 'onKeyDown'
    | 'aria-label' | 'aria-describedby' | 'aria-errormessage'
    // ── mobile-only(NativeSelect 原生 <select> 生效;桌機 custom combobox documented no-op)──
    | 'autoFocus' | 'autoComplete'
  > {
  /** `data-*` passthrough(桌機 trigger div rest spread / mobile `<select>` spread;dim-9 契約)。 */
  [dataAttribute: `data-${string}`]: unknown
  mode?: FieldMode
  /** Field chrome variant. Default = context.variant ?? 'default'. Per-prop override. */
  variant?: FieldVariant
  /** 寬度軸 — `fill` 填滿容器(default)/ `hug` 依內容收縮:value 寬 + slot 元素寬 + gap +
   *  field 內 padding;chrome 與互動不變。場景 = detail pane inline metadata。
   *  SSOT → field-controls.spec.md「寬度軸(width: fill / hug)」。 */
  width?: FieldWidth
  error?: boolean
  size?: 'sm' | 'md' | 'lg'
  options: SelectOption[]
  /** 分組顯示(對齊 SelectMenu groups SSOT)。option.group 對應 groups[].key */
  groups?: SelectGroupConfig[]
  /** Controlled value(consumer 自管 state)。傳 `value` + `onChange` 表示 controlled mode。 */
  value?: string | null
  /** Uncontrolled 初始值(2026-05-21 D3 audit add per user verbatim「決策三照妳建議」+「都給我做到好」)。
   *  不傳 `value` 時 Select 自管 internal state,以 `defaultValue` 為初始值,選變更時 fire `onChange`
   *  callback 通知 consumer(但 state 仍歸 Select)。對齊 Radix Select(`defaultValue`)+ shadcn Input
   *  (`defaultValue`)+ React `<input>` dual-mode canonical。
   *  互斥規則:同時傳 `value` + `defaultValue` 走 controlled(value 勝),`defaultValue` 僅 first-mount 用。 */
  defaultValue?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  clearable?: boolean
  display?: 'plain' | 'tag'
  startIcon?: LucideIcon
  /** 啟用搜尋（desktop 時 field 變 input，打字即篩選） */
  searchable?: boolean
  /** Loading state(2026-05-15 audit B fix;2026-07-04 Q3 拍板措辭修訂)。
   *  Forward 給 SelectMenu primitive SSOT;spinner 只在**無可顯示選項時**佔 empty slot(cmdk CommandEmpty
   *  機制)— 已有 stale options 時保留顯示不清空(對齊 MUI Autocomplete「only if there are no suggestions」)。
   *  Trigger 不變(chevron 保留 user 隨時可點開)。*/
  loading?: boolean

  /** Menu list 最小列數(空狀態 / 選項少時的視覺一致 reserve)。預設 3 — 選項 < 3 時顯式縮(如 And/Or 兩選項) */
  minRows?: number
  /** Initial open state(uncontrolled)。對齊 Radix Popover defaultOpen canonical;DataTable cell-as-input
   *  click → 1 step open menu(Airtable / Notion canonical),consumer pass `defaultOpen` 達成。
   *  Note:Native Select(mobile)無 popover 概念,此 prop 僅 Custom path 生效。 */
  defaultOpen?: boolean
  /** open state 變更 callback(對齊 Radix Popover onOpenChange canonical)。
   *  DataTable cell-as-input 用:open=false 時 cell 自動 exit edit mode(避免 dismiss 後卡住)。 */
  onOpenChange?: (open: boolean) => void
  /**
   * View mode 顯 picker intrinsic end icon(2026-05-08 D path Phase 1)。
   * 預設 false:`mode="view"` 純展示 bare span(向後相容)。
   * `variant="naked" && mode="view"` 場景(DataTable cell)opt-in 設 true → wrap 進
   * Field naked-view + 渲 ChevronDown ItemSuffix。**只 view mode 生效**;readonly /
   * disabled / edit 已有 Field wrapper + suffix(不受此 prop 影響)。
   * Authority:`data-table.spec.md:204` + `inline-action.spec.md:157`「Field family endAction(自動繼承)」。
   * @default false
   */
  showDisplayEndIcon?: boolean
  /**
   * 「已選項目」客製 render(2026-05-07 v15.5;2026-07-08 A 案回歸修正擴及 4 mode)。
   *
   * 設了 → 已選值不走純文字 / Tag 預設 path,改用 consumer 提供的 ReactNode(收 selectedOpt)。
   * **view / readonly / disabled / edit 4 mode 共享同一 renderer**(field-controls.spec.md
   * 共享 contract (a),禁 edit-only)— renderer 輸出屬「值內容」(status icon+text 等語意呈現),
   * view 態照常渲染;A 案撤的是 affordance(chevron/outline),非值內容(field.spec.md L6 分層)。
   * Searchable+open 仍走 input(搜尋優先)。Empty value(no selection)仍走 placeholder。
   *
   * 用例:PeoplePicker 用此 slot 把 single 選中的 person render 成 PersonDisplay
   * (avatar + name)而非純文字 label;DataTable status 欄 icon+text。對齊 PeoplePicker = Select wrapper SSOT。
   */
  selectedItemRenderer?: (selectedOpt: SelectOption) => React.ReactNode
  /** 搜尋無結果提示(2026-07-04 Q4 拍板接線 — 原 spec 宣稱可覆寫但 prop 從未轉發)。
   *  Forward 給 SelectMenu primitive SSOT(default 在 SelectMenu 層「沒有符合的選項」);
   *  僅 Custom path(searchable dropdown)生效,Native path 無搜尋空狀態。
   *  對齊 MUI noOptionsText / Ant notFoundContent / Polaris emptyState 三家公開覆寫點共識。 */
  emptyText?: string
}

// ── Icon / size helpers ─────────────────────────────────────────────────────
// 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反)
const getIconSize = (size: string) => ICON_SIZE[size as 'sm' | 'md' | 'lg']

// ── Shared sub-components ───────────────────────────────────────────────────

/**
 * Inline clear button for Select trigger.
 * 共用 SSOT — Native + Custom 兩變體統一消費。差別僅 onClick 內是否 stopPropagation
 * (Custom trigger 是 combobox `<div>`,點 clear 不可冒泡到打開 menu;Native `<select>` 自有原生
 * 行為,不需 stopPropagation)。
 *
 * 消費的 SSOT:
 * - patterns/element-anatomy/item-anatomy.spec.md → ItemInlineAction(canonical row inline action)
 */
function SelectClearButton({
  size,
  onClear,
  stopPropagation = false,
}: {
  size: 'sm' | 'md' | 'lg'
  onClear: () => void
  stopPropagation?: boolean
}) {
  return (
    <span className="relative z-10">
      <ItemInlineAction
        size={size}
        action={{
          icon: X,
          label: '清除選取', // i18n-allow: DS default inline-action label
          onClick: stopPropagation ? (e) => { e?.stopPropagation(); onClear() } : () => onClear(),
        }}
      />
    </span>
  )
}
SelectClearButton.displayName = 'SelectClearButton'

/**
 * Trigger content for CustomSelect — 三種顯示模式分支(searchable+open / text / tag)
 * 抽出降低 `CustomSelect` forwardRef body 長度;邏輯本質是純展示分流,無 hook / ref。
 */
function CustomSelectTriggerContent({
  searchable,
  open,
  isTextDisplay,
  size,
  value,
  selectedLabel,
  selectedOpt,
  SelectedIcon,
  StartIcon,
  iconSize,
  placeholder,
  search,
  setSearch,
  inputRef,
  activeDescendantId,
  ariaLabel,
  labelId,
  selectedItemRenderer,
}: {
  searchable: boolean
  open: boolean
  isTextDisplay: boolean
  size: 'sm' | 'md' | 'lg'
  value?: string | null
  selectedLabel: string
  selectedOpt?: SelectOption
  SelectedIcon?: LucideIcon
  StartIcon?: LucideIcon
  iconSize: number
  placeholder?: string
  search: string
  setSearch: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  activeDescendantId?: string
  ariaLabel?: string
  labelId?: string
  selectedItemRenderer?: (selectedOpt: SelectOption) => React.ReactNode
}): React.ReactNode {
  // Searchable + open: 顯示搜尋 input
  // 2026-05-15 Bug 2 fix(Claude+Codex Step 5 比稿 consensus,user verbatim「就 A」):
  // 撤掉 native `<input placeholder=selectedLabel>` 不可靠 ellipsis renderer(browser-specific
  // placeholder painting,user 抓「placeholder 直接被截掉沒 ellipsis」)。改 span overlay:
  // - input native placeholder 限「搜尋…」/「請選擇人員」trigger empty hint(無 selectedLabel)
  // - sibling `<span aria-hidden pointer-events-none absolute inset-0 truncate>` 在 search='' 且
  //   有 selectedLabel 時 overlay 顯該人名(memory aid,truncate-with-ellipsis 可控)
  // 對齊 spec.md §B row 4「open + inline-search + 選 1 人 → input cursor + placeholder = 該人名 + ellipsis」。
  // a11y(2026-07-05 backlog 補接):搜尋 input 是 open 時實際聚焦的元素,accessible name 必接在
  // input 本身(原 codex Q2 guard 註解宣稱「來自 field/label/aria-label」,但接線全在外層 trigger
  // div,焦點所在的 input 無 name)— aria-labelledby 接 FieldLabel labelId、consumer aria-label
  // 優先(對齊 trigger div 同款 guard),兩者皆無時 fallback aria-label「搜尋選項」(對齊
  // combobox.tsx searchAriaLabel canonical default);**不**依賴 placeholder 當 label;overlay
  // span aria-hidden + pointer-events-none。APG「combobox role 移到 input 本身」屬中期重構另案。
  if (searchable && open) {
    const triggerEmptyPlaceholder = placeholder || '搜尋…' // i18n-allow: DS fallback
    const showSelectedOverlay = !search && selectedLabel
    return (
      <span className="relative flex-1 min-w-0 inline-flex items-center">
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // a11y(2026-07-05 D4):cmdk active item id(useActiveDescendant)→ SR 播報方向鍵導覽中的 option
          aria-activedescendant={activeDescendantId}
          // accessible name:aria-labelledby(Field label)> consumer aria-label > DS default(accname 優先序)
          aria-label={ariaLabel ?? '搜尋選項'} // i18n-allow: DS default(對齊 combobox.tsx searchAriaLabel canonical)
          aria-labelledby={ariaLabel ? undefined : labelId}
          // Native placeholder 限 trigger empty hint(無 selectedLabel 時);若已 selected,留空交給 overlay span
          placeholder={showSelectedOverlay ? '' : triggerEmptyPlaceholder}
          className={cn(bareInputStyles, 'cursor-text')}
          autoFocus
        />
        {showSelectedOverlay && (
          // 2026-05-16 Bug B 真 root cause fix(Claude+Codex M31 Step 5 比稿 consensus,user verbatim
          // 「修了一百次還沒好」+ codex cite W3C CSS Overflow / MDN / Mozilla Bug 972664#c1):
          // 原 `inline-flex items-center truncate` 套同一 span,text 變 anonymous flex item →
          // `text-overflow:ellipsis` 對 anonymous item 不 styleable → ellipsis dots 不可見(text 純 clip)。
          // 對齊 `person-display.tsx:148` 既有 DS canonical:outer flex container + inner truncate 真實 box。
          // DS-wide grep 29 個 truncate 都遵此 pattern,只本處違反 — 修齊。
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center text-fg-muted"
          >
            <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          </span>
        )}
      </span>
    )
  }
  // **selectedItemRenderer slot**(2026-05-07 v15.5):consumer 客製 selected display(e.g.
  // PeoplePicker 接 PersonDisplay)。優先於 isTextDisplay / Tag 預設 path,但 empty value
  // 仍走 placeholder。對齊 PeoplePicker = Select wrapper SSOT。
  if (selectedItemRenderer && value && selectedOpt) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {/* 2026-05-14 item-anatomy SSOT fix(per codex H2 propagation 斷點):加 nakedCellRowModeAlign
            → autoRowHeight cell 內 selected renderer 也對齊 first-line,不再 vertical-center 整 row。 */}
        <span className={cn("flex-1 min-w-0 inline-flex items-center", nakedCellRowModeAlign)}>{selectedItemRenderer(selectedOpt)}</span>
      </>
    )
  }
  // Text display: 純文字 + optional value icon
  if (isTextDisplay) {
    return (
      <>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {!StartIcon && SelectedIcon && value && <ItemPrefix><SelectedIcon size={iconSize} className="pointer-events-none" aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 truncate', !value && 'text-fg-muted')}>
          {value ? selectedLabel : (placeholder ?? '選擇…')}
        </span>
      </>
    )
  }
  // Tag display: 用 option 的 tagVariant
  return (
    <>
      {value && selectedOpt?.tagVariant
        ? <Tag size={size} color={selectedOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'} className="shrink-0 pointer-events-none">{selectedLabel}</Tag>
        : value
          ? <Tag size={size} className="shrink-0 pointer-events-none">{selectedLabel}</Tag>
          : <span className="text-fg-muted">{placeholder ?? '選擇…'}</span>
      }
      <span className="flex-1" />
    </>
  )
}
CustomSelectTriggerContent.displayName = 'CustomSelectTriggerContent'

// ── Shared readonly/disabled/view render ─────────────────────────────────
function ReadonlyDisplay({
  mode, variant: variantProp, width, size, options, value, display, startIcon: StartIcon, className, placeholder, showDisplayEndIcon, selectedItemRenderer,
}: Pick<SelectProps, 'mode' | 'width' | 'size' | 'options' | 'value' | 'display' | 'startIcon' | 'className' | 'placeholder' | 'showDisplayEndIcon' | 'selectedItemRenderer'> & {
  /** @internal 2026-07-14 API 策展 E:內部 render helper 吃 FieldVariantInternal(naked 由 cell-registry 通道傳入)*/
  variant?: FieldVariantInternal
}) {
  const resolvedMode = mode ?? 'readonly'
  const emptyDisplay = useFieldEmptyDisplay()
  const variant = variantProp ?? 'default'
  const sz = size ?? 'md'
  const iconSize = getIconSize(sz)
  // selectedOpt 提前 hoist(2026-07-08 A 案回歸修正):view / D-path / readonly / disabled
  // 四分支都需要 — renderer 值內容(field-controls.spec.md contract (a) 4-mode 共享)+ tagVariant 查找。
  const selectedOpt = options?.find(o => o.value === value)
  const label = selectedOpt?.label ?? value
  const iconColor = resolvedMode === 'disabled' ? 'text-fg-disabled' : 'text-fg-muted'
  const isTextDisplay = display !== 'tag'
  // K10+K14 fix(2026-05-04):disabled mode placeholder/empty 顯示色 → fg-disabled(neutral-6),非 fg-muted(neutral-7)
  //   user canonical:disabled 顯著性優於 muted。同時 plain mode 必須 respect placeholder prop(之前忽略 = bug)
  const emptyColorCls = fieldEmptyColorClass(resolvedMode)
  const emptyText = placeholder ?? emptyDisplay

  // mode='view':2 path(2026-05-08 D path Phase 1 Select canary)
  //   ❌ 預設(無 showDisplayEndIcon):純內容輸出 bare span/Tag(原行為,backward compat)
  //      對齊原 SelectDisplay sub-component(retired)。readonly / disabled 仍走下方 fieldWrapperStyles。
  //   ✅ showDisplayEndIcon=true(DataTable cell opt-in):Field naked-view wrapper +
  //      ChevronDown ItemSuffix。SSOT canonical 跟 readonly/edit/disabled mode 同 DOM 結構。
  //      Authority: data-table.spec.md:204 + inline-action.spec.md:157「Field family endAction」
  if (resolvedMode === 'view') {
    if (!showDisplayEndIcon) {
      // 2026-05-14 I2 fix(spec contract (e) view typography canonical):bare span 必套
      // `fieldDisplayTextClass(sz)`(sm/md→text-body,lg→text-body-lg)— 對齊跨 Field
      // family view 視覺尺寸統一。
      if (!value) return <span className={cn(fieldDisplayTextClass(sz), emptyColorCls, className)}>{emptyText}</span>
      // 2026-07-08 A 案回歸修正:selectedItemRenderer(值內容:status icon+text 等語意呈現)
      // view 態照常渲染 — 無 chrome 無 chevron,只有值內容本身。分層原則(field.spec.md L6):
      // 本 renderer 歸「值內容」,恆顯;A 案撤的是 affordance(chevron/outline),非值內容。
      // 對齊 field-controls.spec.md 共享 contract (a)「4 mode 共享同一 renderer(禁 edit-only)」。
      if (selectedItemRenderer && selectedOpt) {
        return (
          <span className={cn(fieldDisplayTextClass(sz), 'inline-flex items-center min-w-0', nakedCellRowModeAlign, className)}>
            {selectedItemRenderer(selectedOpt)}
          </span>
        )
      }
      if (isTextDisplay) return <span className={cn(fieldDisplayTextClass(sz), 'truncate', className)}>{label}</span>
      const tVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
      return <Tag size={sz} color={tVariant} className={className}>{label}</Tag>
    }
    // D path opt-in: Field naked-view wrapper + ItemSuffix ChevronDown
    const tVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    return (
      <div
        className={cn(fieldWrapperStyles({ mode: 'view', variant, width, size: sz }), value && !isTextDisplay && tagPadding[sz], className)}
        data-field-mode="view"
      >
        {selectedItemRenderer && value && selectedOpt ? (
          // renderer 優先(同 CustomSelectTriggerContent 優先序):值內容歸 renderer,chevron 歸 D-path chrome
          <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign)}>
            {selectedItemRenderer(selectedOpt)}
          </span>
        ) : isTextDisplay ? (
          <span className={cn(bareInputStyles, 'flex-1 min-w-0 truncate', !value && emptyColorCls)}>
            {value ? label : emptyText}
          </span>
        ) : value ? (
          <Tag size={sz} color={tVariant}>{label}</Tag>
        ) : (
          <span className={cn('flex-1 min-w-0', emptyColorCls)}>{emptyText}</span>
        )}
        <ItemSuffix><ChevronDown size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemSuffix>
      </div>
    )
  }

  // 2026-06-26 類型身份 indicator 規則:edit 顯示 / readonly 不顯示(純值、不可開下拉,箭頭會誤導) /
  // disabled 保留(fg-disabled,對齊原生 <select disabled> 灰示箭頭 + Accordion M24 precedent)。
  // naked cell 情境依 showDisplayEndIcon = isEditable,維持 2026-05-10 cell canonical「非可編欄不顯」。
  // aria-disabled:styled-disabled(非 native disabled 元素)需明告 AT「inactive」,同時讓 axe 正確
  // 豁免 disabled 文字的 color-contrast(WCAG 1.4.3 inactive UI 例外)。
  const showIndicator = variant === 'naked' ? !!showDisplayEndIcon : resolvedMode === 'disabled'
  const ariaDisabled = resolvedMode === 'disabled' ? true : undefined

  // 2026-07-08 A 案回歸修正:readonly / disabled 同樣消費 selectedItemRenderer(值內容 4-mode
  // 共享,field-controls.spec.md contract (a);對照 PeoplePicker readonly/disabled 渲 PersonDisplay
  // 先例)。renderer 優先於 isTextDisplay / Tag 預設 path(同 CustomSelectTriggerContent 優先序);
  // disabled 時 wrapper span 帶 text-fg-disabled 供未自帶色的文字繼承(M24 disabled > muted)。
  if (selectedItemRenderer && value && selectedOpt) {
    return (
      <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, width, size: sz }), className)} data-field-mode={resolvedMode} aria-disabled={ariaDisabled}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className={cn('pointer-events-none', iconColor)} aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 inline-flex items-center', nakedCellRowModeAlign, resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {selectedItemRenderer(selectedOpt)}
        </span>
        {showIndicator && <ItemSuffix className="pointer-events-none"><ChevronDown size={iconSize} className={cn('shrink-0', iconColor)} aria-hidden /></ItemSuffix>}
      </div>
    )
  }

  if (isTextDisplay) {
    return (
      <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, width, size: sz }), className)} data-field-mode={resolvedMode} aria-disabled={ariaDisabled}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className={cn('pointer-events-none', iconColor)} aria-hidden /></ItemPrefix>}
        <span className={cn('flex-1 min-w-0 truncate', resolvedMode === 'disabled' && 'text-fg-disabled')}>
          {value ? label : <span className={emptyColorCls}>{emptyText}</span>}
        </span>
        {showIndicator && <ItemSuffix className="pointer-events-none"><ChevronDown size={iconSize} className={cn('shrink-0', iconColor)} aria-hidden /></ItemSuffix>}
      </div>
    )
  }

  const tagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined

  return (
    <div className={cn(fieldWrapperStyles({ mode: resolvedMode, variant, width, size: sz }), value && tagPadding[sz], className)} style={{ paddingRight: 'var(--field-px)' }} data-field-mode={resolvedMode} aria-disabled={ariaDisabled}>
      {value ? <Tag size={sz} color={tagVariant}>{label}</Tag> : <span className={emptyColorCls}>{emptyText}</span>}
      {showIndicator && <ItemSuffix className="pointer-events-none"><ChevronDown size={iconSize} className={cn('shrink-0', iconColor)} aria-hidden /></ItemSuffix>}
    </div>
  )
}

// ── Native Select (mobile) ─────────────────────────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const NativeSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ mode, variant: variantProp, width, error: errorProp = false, size: sizeProp, options, value: valueProp, defaultValue, onChange, placeholder, className, disabled: disabledProp, clearable = false, display = 'plain', startIcon: StartIcon, showDisplayEndIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp,
    // 2026-07-04:Custom-path-only props 顯式 destructure 丟棄(不 spread 到原生 <select> 消 React
    // unknown-prop warning);各 prop docblock 已註「僅 Custom path 生效」語意
    // 2026-07-08 A 案回歸修正:selectedItemRenderer 從丟棄名單移出 — Native path 的
    // ReadonlyDisplay(view/readonly/disabled)同樣消費值內容 renderer(contract (a) 4-mode
    // 共享,值內容不因 pointer type 而異);native <select> edit 路徑仍不消費(原生 option 無法客製 render)。
    searchable: _searchable, groups: _groups, loading: _loading, minRows: _minRows, emptyText: _emptyText, defaultOpen: _defaultOpen, onOpenChange: _onOpenChange, selectedItemRenderer,
    ...props }, ref) => {
    const fieldCtx = useFieldContext()
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-05-31 #11:size 從 Field context cascade(對齊 Input/NumberInput + MUI FormControl)
    const size = useResolvedFieldSize(sizeProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode(prop > 有效 disabled > fieldCtx.mode > 'edit');修 <Field mode="view"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    const iconSize = getIconSize(size)
    // 2026-05-21 D3 audit:Controlled / Uncontrolled dual-mode via 既有 SSOT hook(同 CustomSelect)
    const [value, setValue] = useControllable<string | null>({
      value: valueProp,
      defaultValue: defaultValue ?? null,
      onChange: onChange ? (next) => onChange(next ?? '') : undefined,
    })
    const handleNativeChange = (v: string) => setValue(v)
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'plain'
    const selectRef = React.useRef<HTMLSelectElement | null>(null)
    const setSelectRef = React.useCallback((el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }, [ref])

    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} width={width} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} showDisplayEndIcon={showDisplayEndIcon} selectedItemRenderer={selectedItemRenderer} />
    }

    const selectEl = (
      <select
        ref={setSelectRef}
        id={idProp ?? fieldCtx?.id}
        value={value ?? ''}
        onChange={(e) => handleNativeChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error || undefined}
        aria-required={fieldCtx?.required || undefined}
        aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
        aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
        className={cn(bareInputStyles, 'cursor-pointer appearance-none', !value && 'text-fg-muted', !isTextDisplay && value && 'absolute inset-0 w-full h-full opacity-0 z-0')}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {/* disabled forward(2026-07-04):對齊桌機 path menuOptions disabled forward — 觸控原生 option 同樣不可選(spec「disabled 選項」邊界案例) */}
        {options.map(opt => <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>)}
      </select>
    )

    const clearEl = showClear ? (
      <SelectClearButton size={size ?? 'md'} onClear={() => handleNativeChange('')} />
    ) : null

    const chevronEl = (
      <ItemSuffix className="relative z-10 pointer-events-none">
        <ChevronDown size={iconSize} className="text-fg-muted" aria-hidden />
      </ItemSuffix>
    )
    const selectedOpt = options?.find(o => o.value === value)
    const label = selectedOpt?.label ?? value
    const nativeTagVariant = selectedOpt?.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral' | undefined
    const SelectedOptIcon = selectedOpt?.icon

    if (!isTextDisplay) {
      return (
        <div className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, width, size, error }), value && tagPadding[size], 'relative',
          className)}
          style={{ paddingRight: 'var(--field-px)' }} data-field-mode="edit" data-error={error ? '' : undefined}>
          {value ? <Tag size={size} color={nativeTagVariant} className="shrink-0 relative z-10 pointer-events-none">{label}</Tag> : <span className="text-fg-muted">{placeholder ?? '選擇...'}</span>}
          {selectEl}
          <span className="flex-1" />
          {clearEl}
          {chevronEl}
        </div>
      )
    }

    return (
      <div className={cn(fieldWrapperStyles({ mode: 'edit', variant: variant, width, size, error }),
        className)}
        data-field-mode="edit" data-error={error ? '' : undefined}>
        {StartIcon && <ItemPrefix><StartIcon size={iconSize} className="text-fg-muted pointer-events-none" aria-hidden /></ItemPrefix>}
        {!StartIcon && SelectedOptIcon && value && <ItemPrefix><SelectedOptIcon size={iconSize} className="pointer-events-none" aria-hidden /></ItemPrefix>}
        {selectEl}
        {clearEl}
        {chevronEl}
      </div>
    )
  }
)
NativeSelect.displayName = 'NativeSelect'

// ── Custom Select (desktop — consumes SelectMenu) ────────────────────────

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const CustomSelect = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ mode, variant: variantProp, width, error: errorProp = false, size: sizeProp, options, groups, value: valueProp, defaultValue, onChange, placeholder, className, disabled: disabledProp, name, required, form, clearable = false, display = 'plain', startIcon: StartIcon, searchable = false, loading, minRows, emptyText, defaultOpen = false, onOpenChange, selectedItemRenderer, showDisplayEndIcon, id: idProp, 'aria-describedby': ariaDescribedByProp, 'aria-errormessage': ariaErrorMessageProp, 'aria-label': ariaLabel, onKeyDown: onKeyDownProp, style: styleProp,
    // 2026-07-14 API 策展 D:mobile-only props(allowlist 註記)desktop 顯式丟棄 — div trigger 無原生
    // 對應,不 spread 進 DOM(對稱 NativeSelect 丟棄 custom-path-only props 的既有 pattern)
    autoFocus: _autoFocus, autoComplete: _autoComplete, ...rest }, ref) => {
    const fieldCtx = useFieldContext()
    const error = useResolvedFieldInvalid(errorProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-05-31 #11:size 從 Field context cascade(對齊 Input/NumberInput + MUI FormControl)
    const size = useResolvedFieldSize(sizeProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode(prop > 有效 disabled > fieldCtx.mode > 'edit');修 <Field mode="view"> 漏 cascade
    const resolvedMode = useResolvedFieldMode({ mode, disabled })
    const variant: FieldVariantInternal = useResolvedFieldVariant(variantProp)
    const iconSize = getIconSize(size)
    // 2026-05-21 D3 audit:Controlled / Uncontrolled dual-mode via 既有 SSOT hook(M17 對齊,取代自刻 isControlled pattern)。
    // Phase B codex 抓:之前 Custom clear 走 `onChange?.('')` 沒 setInternalValue → uncontrolled clear 失效。useControllable 統一 setter 修。
    // onChange forward coerce null → ''(consumer 簽名 `(value: string) => void`,null 是 internal empty signal)。
    const [value, setValue] = useControllable<string | null>({
      value: valueProp,
      defaultValue: defaultValue ?? null,
      onChange: onChange ? (next) => onChange(next ?? '') : undefined,
    })
    const showClear = clearable && value && resolvedMode === 'edit'
    const isTextDisplay = display === 'plain'

    const [open, setOpen] = React.useState(defaultOpen)
    const [search, setSearch] = React.useState('')
    const inputRef = React.useRef<HTMLInputElement>(null)
    // a11y(2026-07-04):listbox 容器 id——trigger aria-controls 指向 SelectMenu PopoverContent
    // (對齊姊妹元件 combobox.tsx:677 既有 canonical;React.useId SSR/CSR 穩定)。
    const listboxId = React.useId()
    // a11y(2026-07-05 D4):追蹤 cmdk active item id → searchable trigger input 綁 aria-activedescendant
    // (機制詳 select-menu.tsx useActiveDescendant docblock;必在 early return 前呼叫 — React #310 hook 順序)。
    const activeOptionId = useActiveDescendant(listboxId, open)

    // 關閉時清搜尋
    React.useEffect(() => { if (!open) setSearch('') }, [open])

    // **React #310 fix(2026-05-04)**:所有 hooks 必在任何 early return 前 call,
    //   否則 disabled→edit 切換時 hook count 變動 → React 死亡。
    //   原本 useMemo(L280, L291) 在 early return 之後 = latent bug,K13 觸發(filter Op 從 disabled
    //   變 edit 當 user 選欄位)。修法:把所有 useMemo 提到 early return 之前。
    const selectedOpt = options?.find(o => o.value === value)
    // 2026-05-06 v9.1:value 不在 options 也要顯示原值(不沉默丟失)。原 fallback `''` 致
    // SelectCell 開 edit 時若 cell value 不在當前 options(e.g. 上游資料漂移 / options async
    // 後到 / 跨 dataset),trigger 顯示空白 — user 報「value 不見」。對齊 ReadonlyDisplay 同
    // 級 fallback `?? value`。
    const selectedLabel = selectedOpt?.label ?? value ?? ''
    const SelectedIcon = selectedOpt?.icon
    // ── 過濾選項 ──
    const filteredOptions = searchable && search
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
      : options
    // ── 轉換 SelectOption → SelectMenuOption(必在 early return 前) ──
    // Issue 4(2026-05-10):forward avatar / description / disabled SSOT(per SelectMenuOption schema)。
    const menuOptions: SelectMenuOption[] = React.useMemo(
      () => filteredOptions.map(opt => ({
        value: opt.value,
        label: opt.label,
        icon: isTextDisplay ? opt.icon : undefined,
        avatar: opt.avatar,
        description: opt.description,
        disabled: opt.disabled,
        group: opt.group,
      })),
      [filteredOptions, isTextDisplay]
    )
    // ── Tag display 自訂 label 渲染(必在 early return 前) ──
    const renderLabel = React.useMemo(() => {
      if (isTextDisplay) return undefined
      return (menuOpt: SelectMenuOption) => {
        const srcOpt = options.find(o => o.value === menuOpt.value)
        if (srcOpt?.tagVariant) {
          return <Tag size={size} color={srcOpt.tagVariant as 'blue' | 'green' | 'red' | 'yellow' | 'neutral'}>{menuOpt.label}</Tag>
        }
        return menuOpt.label
      }
    }, [isTextDisplay, options, size])

    // **React #310 fix v2(2026-05-04)**:`handleValueChange` useCallback 也必在 early return 前
    //   原本 L306(early return 後)→ disabled→edit 切換時 hook count 仍變 → #310 持續
    // 2026-05-21 D3:`useControllable` 統一 controlled / uncontrolled state + onChange forward,不再手動 if-branch。
    const handleValueChange = React.useCallback(
      (newValue: string | string[]) => {
        setValue(Array.isArray(newValue) ? newValue[0] : newValue)
      },
      [setValue]
    )

    // Early return AFTER all hooks(disabled / readonly / view mode 走 ReadonlyDisplay)
    if (resolvedMode !== 'edit') {
      return <ReadonlyDisplay mode={resolvedMode} variant={variant} width={width} size={size} options={options} value={value} display={display} startIcon={StartIcon} className={className} placeholder={placeholder} showDisplayEndIcon={showDisplayEndIcon} selectedItemRenderer={selectedItemRenderer} />
    }

    // 2026-05-21 D3 Phase B codex 抓:Custom clear 用 setValue 不直接 onChange,uncontrolled clear 才能真清 internal state。
    const clearEl = showClear ? (
      <SelectClearButton size={size ?? 'md'} onClear={() => setValue('')} stopPropagation />
    ) : null

    const chevronEl = (
      <ItemSuffix>
        <ChevronDown size={iconSize} className={cn('text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </ItemSuffix>
    )

    // ── Hidden input form mirror(2026-07-13 D2 拍板 Option A;MUI SelectInput idiom)──
    // 桌機自訂 combobox 無原生 form control,`name` / `required` / `form` 歷史上被靜默丟棄
    // (mobile NativeSelect 卻經 {...props} 生效 = 雙路徑提交語義不對稱 footgun)。
    // 補 visually-hidden `<input>` 鏡像,讓桌機也參與原生表單(裸 <form> submit / FormData):
    // - value **單向鏡射**受控 state(useControllable)= projection,非第二 SSOT(M17);
    //   空值時 value=''(不採 Radix hidden <select> 完整 option tree — 其無空 option 時
    //   default 第一項,radix-ui/primitives issue #3521 documented footgun)
    // - 原生 required 僅收顯式 `required` prop(裸表單 opt-in);fieldCtx.required 續走
    //   aria-required + useFormValidation(RHF)方法論(form-validation.spec.md 規則 1-9),
    //   不對既有 Field+RHF consumer 注入瀏覽器原生 bubble
    // - onChange 唯一用途 = 瀏覽器 autofill:match 既有非 disabled option 才經 canonical
    //   setter 寫回(對齊 MUI SelectInput handleChange 同款 guard),其餘輸入忽略
    // - aria-hidden + tabIndex={-1}:AT 與 Tab 序皆不見(semantics 由 role=combobox trigger
    //   own);form-validation 規則 8 focus-first-error 以 DOM name 定位 → 可聚焦 mirror →
    //   trigger focus-within 顯示 focus 邊框(桌機 Select 脫離「非 native 控件略過」fallback)
    // 世界級對照:MUI Select 非原生模式 opacity-0 hidden input 攜 name/required
    // (github.com/mui/material-ui .../Select/SelectInput.js;Select.test.js 官方測試涵蓋
    // required 阻止提交 + FormData 值)+ React Spectrum HiddenSelect(github.com/adobe/
    // react-spectrum .../@react-aria/select/src/HiddenSelect.tsx)+ Headless UI Listbox
    // name → hidden input kept in sync(headlessui.com/react/listbox#using-with-html-forms)。
    const hiddenInputEl = (
      <input
        type="text"
        name={name}
        form={form}
        value={value ?? ''}
        onChange={(e) => {
          const matched = options.find((o) => o.value === e.target.value && !o.disabled)
          if (matched) setValue(matched.value)
        }}
        required={required || undefined}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute bottom-0 left-0 w-full opacity-0 pointer-events-none"
      />
    )

    const triggerContent = (
      <CustomSelectTriggerContent
        searchable={searchable}
        open={open}
        isTextDisplay={isTextDisplay}
        size={size}
        value={value}
        selectedLabel={selectedLabel}
        selectedOpt={selectedOpt}
        SelectedIcon={SelectedIcon}
        StartIcon={StartIcon}
        iconSize={iconSize}
        placeholder={placeholder}
        search={search}
        setSearch={setSearch}
        inputRef={inputRef}
        activeDescendantId={activeOptionId}
        ariaLabel={ariaLabel}
        labelId={fieldCtx?.labelId}
        selectedItemRenderer={selectedItemRenderer}
      />
    )

    // hooks(filteredOptions / menuOptions / renderLabel / handleValueChange)已全 hoist(React #310 fix v2)

    const trigger = (
      <div
        // passthrough(2026-07-14 dim-9 修;同日 API 策展 D 收窄):SelectProps allowlist
        // (Pick<SelectHTMLAttributes>,見 SelectProps docblock)承諾的 data-* / onFocus /
        // onBlur 等 attrs,mobile NativeSelect 經 {...props} spread 到 <select> 生效,desktop
        // 原本完整列舉全丟 → 同一 <Select> API 隨 pointer type 靜默失效(consumer data-testid /
        // onBlur mobile 有、desktop 無)。rest 先 spread —— component 契約 attrs(role / aria-* /
        // id / tabIndex / onKeyDown / className)在後,不可被覆寫;consumer onKeyDown 經
        // onKeyDownProp 在 handler 內先跑(見下)。mobile-only attrs(autoFocus / autoComplete)
        // 已在 destructure 層丟棄不進 rest(div trigger 無原生語意;desktop 表單語意由 hidden
        // input mirror 承擔,見 D2 docblock)。
        {...(rest as unknown as React.HTMLAttributes<HTMLDivElement>)}
        ref={ref}
        id={idProp ?? fieldCtx?.id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        // a11y(2026-07-04):div-based role=combobox 的 <label for> 無效,接 FieldLabel labelId
        // (field-context.ts labelId jsDoc 明文);consumer aria-label 優先(對齊 slider.tsx:166 guard canonical)。
        aria-labelledby={ariaLabel ? undefined : fieldCtx?.labelId}
        aria-invalid={error || undefined}
        // D2(2026-07-13):顯式 required prop 同步進 aria-required(mirror 本身 aria-hidden,
        // AT 看不到其 required;語意由 trigger 播報 — 對齊 mobile 原生 <select required> 行為)
        aria-required={(required || fieldCtx?.required) || undefined}
        aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
        aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
        tabIndex={0}
        className={cn(
          fieldWrapperStyles({ mode: 'edit', variant: variant, width, size, error }),
          !isTextDisplay && value && !searchable && tagPadding[size],
          // 2026-05-06 v13.3 SSOT retire:per-control `open && 'border-primary'` 移除。Field default
          // state machine `data-[state=open]:border-border-hover`(灰深)處理 open。
          // 2026-07-04 Q1:error border 同樣收進 fieldWrapperStyles error variant(error 勝 focus 色)。
          // D2(2026-07-13):`relative` = hidden input mirror 的 absolute 定位容器
          // (fieldWrapperStyles base 無 relative;對齊 NativeSelect tag 分支同款顯式加法)。
          'relative cursor-pointer',
          className,
        )}
        style={styleProp || !isTextDisplay ? { ...styleProp, ...(!isTextDisplay ? { paddingRight: 'var(--field-px)' } : undefined) } : undefined}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
        onKeyDown={(e) => {
          // passthrough(dim-9):consumer onKeyDown 先跑 —— 對齊 native path(<select> 上
          // consumer handler 同樣最先收到);component 導覽邏輯照舊在後。
          onKeyDownProp?.(e as unknown as React.KeyboardEvent<HTMLSelectElement>)
          // 2026-07-14 dim-10 修:內層清除按鈕(SelectClearButton → ItemInlineAction <button>)
          // 的 Enter/Space 會 bubble 到本 handler 被 preventDefault 吞掉 → 鍵盤無法清除。
          // 事件源自 descendant button 時不執行 trigger 鍵盤邏輯(保留原生 activation)。
          // 注意:不能一刀切 e.target !== e.currentTarget — searchable inline <input> 的
          // 鍵盤事件仍需下方 forwardKeyToListbox 轉送選單導覽。
          if (e.target !== e.currentTarget && (e.target as HTMLElement).closest?.('button')) return
          // 2026-07-05 D4 P0:open 後 ArrowUp/Down/Enter 轉送 cmdk root(見 select-menu.tsx
          // forwardKeyToListbox docblock — 原「open 後不攔讓方向鍵導覽」在跨 DOM 子樹機制上不成立)
          if (open && forwardKeyToListbox(listboxId, e)) return
          if (e.key === 'Enter' || e.key === ' ') {
            // 2026-06-11 P0 a11y(R2 deep-audit):原 guard `!searchable` 連「關閉時的鍵盤開啟」一起擋
            // → searchable Select / PeoplePicker single 鍵盤打不開(WCAG 2.1.1)。原意只是開啟後
            // 別吃掉搜尋框的 Space/Enter → 正確 guard = !open(關閉才攔;開啟後不干擾 input 輸入)。
            if (!open) { e.preventDefault(); setOpen(true) }
          }
          // APG combobox 展開鍵:ArrowDown 也可開(對齊 combobox.tsx 同 pattern;open 後不攔讓方向鍵導覽選單)
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) }
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {triggerContent}
        {clearEl}
        {chevronEl}
        {hiddenInputEl}
      </div>
    )

    return (
      <SelectMenu
        options={menuOptions}
        groups={groups}
        value={value ?? null}
        onValueChange={handleValueChange}
        searchable={false}
        loading={loading}
        emptyText={emptyText}
        size={size}
        minRows={minRows}
        open={open}
        onOpenChange={(o) => { setOpen(o); onOpenChange?.(o) }}
        contentId={listboxId}
        renderLabel={renderLabel}
        onOpenAutoFocus={searchable ? (e) => { e.preventDefault(); inputRef.current?.focus() } : undefined}
      >
        {trigger}
      </SelectMenu>
    )
  }
)
CustomSelect.displayName = 'CustomSelect'

// ── Public component（自動偵測 mobile / desktop）──────────────────────────────

const Select = React.forwardRef<HTMLSelectElement | HTMLDivElement, SelectProps>(
  (props, ref) => {
    const isMobile = useIsTouchDevice()

    if (isMobile) {
      return <NativeSelect ref={ref as React.Ref<HTMLSelectElement>} {...props} />
    }

    return <CustomSelect ref={ref as React.Ref<HTMLDivElement>} {...props} />
  }
)
Select.displayName = 'Select'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const selectMeta = {
  component: 'Select',
  family: 4,
  variants: {

  },
  sizes: {

  },
  // 'active' 移除 — trigger 走 Field chrome、menu row 走 MenuItem(其 meta 無 active)(2026-07-07 詞彙統一 DS-wide 按壓訊號盤點:檔內 0 active: utility / 0 *-active token)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted'],
    ring: [],
  },
} as const

export { Select }
