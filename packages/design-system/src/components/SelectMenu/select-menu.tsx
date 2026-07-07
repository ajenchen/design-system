/**
 * @internal — DS-internal 單元(per `.claude/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Select / Combobox wrap 消費,end-user app 請用 wrapper 元件。
 */
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useControllable } from '@/design-system/hooks/use-controllable'
import type { AvatarData } from '@/design-system/components/Avatar/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/design-system/components/Command/command'
import { Command as CommandPrimitive, useCommandState } from 'cmdk'
import { MenuItem, MenuFooter } from '@/design-system/components/Menu/menu-item'
import { Empty } from '@/design-system/components/Empty/empty'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { OVERLAY_SIDE_OFFSET } from '@/design-system/tokens/elevation/overlay-geometry'
import { getMenuListMinHeight } from '@/design-system/components/Field/field-types'
import { RowSizeProvider } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { applySelectAll, clearSelection } from '@/design-system/lib/multi-select-ordering'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

/**
 * SelectMenu — Popover + Command 組成的完整下拉選單
 *
 * ── 功能 ──
 *   單選 / 多選、搜尋過濾、分組、可建立新選項（creatable）
 *   多選有 footer「全部」checkbox
 *
 * ── 架構 ──
 *   Popover（浮動容器）
 *     └── Command（cmdk，搜尋 + 鍵盤導覽）
 *           ├── CommandInput（搜尋框）
 *           ├── CommandList（選項列表）
 *           │     └── CommandGroup → MenuItem
 *           └── Footer（多選全選）
 */

// ── Types ──

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  avatar?: AvatarData
  disabled?: boolean
  group?: string
}

export interface SelectMenuGroupConfig {
  key: string
  label: string
}

type SizeKey = 'sm' | 'md' | 'lg'

// ── Component ──

export interface SelectMenuProps {
  /** 選項列表 */
  options: SelectMenuOption[]
  /** 群組定義（key 對應 option.group） */
  groups?: SelectMenuGroupConfig[]

  /** 當前值（單選 string，多選 string[]） */
  value?: string | string[] | null
  /** 值變更 callback */
  onValueChange?: (value: string | string[]) => void

  /** 多選模式 */
  multiple?: boolean
  /** 顯示搜尋框 */
  searchable?: boolean
  /** 可建立新選項 */
  creatable?: boolean
  /** 建立新選項 callback */
  onCreate?: (value: string) => void
  /** creatable 的 label 格式，預設 '直接使用「{query}」' */
  createLabel?: (query: string) => string

  /** 觸發元件（asChild） */
  children: React.ReactNode
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 空選項提示 */
  emptyText?: string
  /** 多選 footer 全選列文字(2026-07-05 D4:原「全部」字面 hardcode,無法覆寫也無法 i18n) */
  selectAllLabel?: string
  /** Loading 狀態(2026-05-15 audit B fix;2026-07-04 Q3 拍板措辭修訂)
   *  true → 無可顯示選項時 empty slot(cmdk CommandEmpty)渲 `<Empty icon={<CircularProgress size={48}/>} className="py-6" />`
   *  (純 spinner,無 description);已有 options 時保留顯示不清空(MUI Autocomplete「only if there are
   *  no suggestions」共識)。trigger 不變,user 隨時可開 dropdown。DS `empty.spec.md`「loading = Empty +
   *  CircularProgress compose」SSOT。
   */
  loading?: boolean

  /** 尺寸 */
  size?: SizeKey
  /** 對齊方式 */
  align?: 'start' | 'end'
  /** 列表最少顯示幾行選項高度（預設 3），影響空狀態最小高度 */
  minRows?: number
  /** 最小寬度（px），預設跟隨觸發元件 */
  minWidth?: number

  /** 受控 open 狀態 */
  open?: boolean
  /** 預設打開(uncontrolled initial state)— 2026-05-15 audit Dim 26 V1 fix per user verbatim「A:1」approval */
  defaultOpen?: boolean
  /** open 狀態變更 callback */
  onOpenChange?: (open: boolean) => void

  /** 自訂選項 label 渲染（預設渲染 option.label 純文字） */
  renderLabel?: (option: SelectMenuOption) => React.ReactNode
  /** 攔截 PopoverContent 的 onOpenAutoFocus（如 Select searchable 需阻止 focus 搶走） */
  onOpenAutoFocus?: (e: Event) => void

  /**
   * Popover 內容容器的 DOM id(set 在 PopoverContent 外層 div,**非** cmdk 內層 `role="listbox"` 本身)。
   * Combobox / 自定 trigger 用 `aria-controls` 指向此 id 時,指向的是 **popover 容器(listbox 的 ancestor)**——
   * AT 經此容器可定位到內部 cmdk listbox(cmdk List 自帶 auto-generated `role="listbox"` id)。
   */
  contentId?: string

  className?: string
}

// ── SR live status(2026-07-05 D4:empty / loading 空狀態對 SR 不可感知修)──
// cmdk CommandEmpty 渲染為 role="presentation" div、cmdk 全鏈無 aria-live,且 DOM focus 停在
// combobox input(aria-activedescendant 虛擬焦點)→ SR 使用者搜尋到 0 結果或 loading 佔位時
// 聽不到任何播報(loading spinner 的 CircularProgress 無 label 時更是 aria-hidden)。
// 補 visually-hidden polite live region,鏡射 CommandEmpty 可見內容(cmdk Empty 只在
// filtered.count === 0 渲染:loading → 載入文案;否則 → emptyText)。對齊 react-select A11yText /
// APG combobox no-results 播報 + empty.spec.md「動態 filter no-results 容器需 aria-live="polite"」。
// SSOT 放 SelectMenu 一處 → Select / Combobox / PeoplePicker 全體受益。
function SelectMenuLiveStatus({ loading, emptyText }: { loading: boolean; emptyText: string }) {
  const filteredCount = useCommandState((state) => state.filtered.count)
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {filteredCount === 0
        ? (loading ? '載入中…' /* i18n-allow: DS default SR-only 播報文案 */ : emptyText)
        : null}
    </div>
  )
}

// shadcn canonical:forwardRef + displayName 統一。SelectMenu 是 Popover + Command
// composite,自身無 DOM host(trigger 由 consumer 以 asChild children 提供),ref 簽名
// 保留但不附著(consumer 想取 trigger DOM 直接在 children 上自己 ref)。className 合併到
// PopoverContent(contextually 最接近 user-facing surface)。
const SelectMenu = React.forwardRef<HTMLElement, SelectMenuProps>(function SelectMenu({
  options,
  groups,
  value,
  onValueChange,
  multiple = false,
  searchable = false,
  creatable = false,
  onCreate,
  createLabel = (q) => `直接使用「${q}」`,
  children,
  searchPlaceholder = '搜尋…', // i18n-allow: DS default; consumer override via searchPlaceholder prop
  emptyText = '沒有符合的選項', // i18n-allow: DS default; consumer override via emptyText prop
  selectAllLabel = '全部', // i18n-allow: DS default; consumer override via selectAllLabel prop
  loading = false,
  size = 'md',
  align = 'start',
  minRows = 3,
  minWidth,
  open: controlledOpen,
  defaultOpen,
  onOpenChange: controlledOnOpenChange,
  renderLabel,
  onOpenAutoFocus,
  contentId,
  className,
}, _ref) {
  // ── State ──
  // 2026-06-11 R2 bug fix:原手寫 `setOpen = controlledOnOpenChange ?? setInternalOpen` 在
  // uncontrolled + onOpenChange listener 場景(傳 onOpenChange 不傳 open)會讓 listener 蓋掉
  // internal setter → menu 開不了。改消費 DS 既有 useControllable(select.tsx 同 canonical):
  // uncontrolled 時 internal state 為準、onOpenChange 僅通知。
  const [open, setOpen] = useControllable<boolean>({
    value: controlledOpen,
    defaultValue: defaultOpen ?? false,
    onChange: controlledOnOpenChange,
  })
  const [search, setSearch] = React.useState('')

  // ── Value helpers ──
  const selectedValues = React.useMemo<string[]>(() => {
    if (value == null) return []
    return Array.isArray(value) ? value : [value]
  }, [value])

  const isSelected = React.useCallback(
    (v: string) => selectedValues.includes(v),
    [selectedValues]
  )

  // 2026-07-05 P2:單選已選 option — 供 cmdk defaultValue 定 cursor 起點(見下方 <Command>)
  const selectedOption = React.useMemo(
    () => (!multiple ? options.find((o) => o.value === selectedValues[0]) : undefined),
    [multiple, options, selectedValues]
  )

  const handleSelect = React.useCallback(
    (optionValue: string) => {
      if (multiple) {
        const next = isSelected(optionValue)
          ? selectedValues.filter((v) => v !== optionValue)
          : [...selectedValues, optionValue]
        onValueChange?.(next)
      } else {
        onValueChange?.(optionValue)
        setOpen(false)
      }
    },
    [multiple, selectedValues, isSelected, onValueChange, setOpen]
  )

  // ── Multi-select: select all ──
  const selectableOptions = React.useMemo(
    () => options.filter((o) => !o.disabled),
    [options]
  )

  const allState: boolean | 'indeterminate' = React.useMemo(() => {
    if (!multiple) return false
    const count = selectableOptions.filter((o) => isSelected(o.value)).length
    if (count === 0) return false
    if (count === selectableOptions.length) return true
    return 'indeterminate'
  }, [multiple, selectableOptions, isSelected])

  // 2026-05-16 SSOT canonical fix(Claude+Codex M31 Round 4 共識 + user verbatim「就照你們
  // 的共識做到完美確保有 SSOT」):
  //
  // 原 fully-replace `selectableOptions.map(v)` = source order reset,但**Ant Design 跨元件 grep
  // 證據顯示 source-reset 沒 Ant precedent**(Transfer + Table rowSelection 都是 preserve+append)。
  // 改 `applySelectAll(selectedValues, all)` SSOT primitive 對齊 Ant Transfer canonical:
  //   `Array.from(new Set([...prevKeys, ...keys]))` — preserve existing + append unselected。
  //
  // SSOT in `@/design-system/lib/multi-select-ordering` — 未來新 multi-select with Select All
  // footer 必 consume 此 primitive(hook `check_select_all_canonical.sh` 機械強制),
  // 不再各自 reimplement → 防 ordering policy drift。
  const handleSelectAll = React.useCallback(() => {
    if (!multiple) return
    if (allState === true) {
      onValueChange?.(clearSelection())
    } else {
      onValueChange?.(applySelectAll(selectedValues, selectableOptions.map((o) => o.value)))
    }
  }, [multiple, allState, selectableOptions, selectedValues, onValueChange])

  // ── Creatable ──
  const showCreate = React.useMemo(() => {
    if (!creatable || !search.trim()) return false
    return !options.some(
      (o) => o.label.toLowerCase() === search.trim().toLowerCase()
    )
  }, [creatable, search, options])

  // ── Grouping ──
  const groupedOptions = React.useMemo(() => {
    if (!groups?.length) return [{ key: '__default', label: '', options }]
    const grouped = groups.map((g) => ({
      ...g,
      options: options.filter((o) => o.group === g.key),
    }))
    const ungrouped = options.filter((o) => !o.group)
    if (ungrouped.length) {
      grouped.unshift({ key: '__default', label: '', options: ungrouped })
    }
    return grouped
  }, [groups, options])

  // ── Reset search on close ──
  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // 2026-06-01 Select/Combobox #15(user 拍板 A):非搜尋時開選單把 focus 移到 cmdk-root,
  // 讓 cmdk 內建方向鍵 / Enter / Home / End 導覽生效。原 PopoverContent default autofocus 找 body
  // input/button,非搜尋無 input + 選項是 role=option div → focus 落在 content wrapper,cmdk 的 keydown
  // handler 綁在 cmdk-root 收不到事件 → 桌機鍵盤導覽不可達(WAI-ARIA combobox 違反)。
  // **純鍵盤路由**:滑鼠點擊路徑完全不碰;cmdk active-option highlight 是 cmdk 內部 state(非 DOM focus
  // 驅動)故視覺不變。selector miss 時 root=null → no-op fallback(無回歸)。
  // SSOT 在 SelectMenu → Select / Combobox / 所有 non-searchable SelectMenu consumer 自動受益。
  const handleNonSearchableAutoFocus = React.useCallback((e: Event) => {
    e.preventDefault()
    const root = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[cmdk-root]')
    root?.focus({ preventScroll: true })
  }, [])

  // RowSizeProvider 讓 PopoverContent 子樹內任何 <ItemIcon> / <ItemAvatar> /
  // <ItemInlineAction> 都自動讀到對的 size,跟 SidebarProvider / TreeView 同一條規則。
  // (注:Popover 透過 Portal 渲染,context 仍然會跨 portal 傳遞——React context 是 tree-based
  // 不是 DOM-based,Portal 不影響 context propagation)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <RowSizeProvider value={size}>
      <PopoverContent
        id={contentId}
        // w-auto override PopoverContent default w-72(rich-popover canonical)— SelectMenu 走「跟 trigger 同寬」
        // canonical(spec L72)。minWidth = max(trigger-width, 240px sensible-min)— 對齊 shadcn / Material / Ant
        // select dropdown 共識(2026-05-04 D1 verify SelectMenu spec implementation)。
        className={cn(
          'p-0 w-auto rounded-lg border border-border bg-surface-raised overflow-hidden',
          className
        )}
        style={{
          boxShadow: 'var(--elevation-200)',
          minWidth: minWidth ?? 'max(var(--radix-popover-trigger-width), 15rem)',
        }}
        align={align}
        sideOffset={OVERLAY_SIDE_OFFSET}
        onOpenAutoFocus={onOpenAutoFocus ?? (!searchable ? handleNonSearchableAutoFocus : undefined)}
        // **2026-05-07 v15.16 nested portal fix**:Tag dismiss inside trigger
        // 區的 OverflowIndicator HoverCard popup(獨立 Radix portal,DOM 不在
        // PopoverContent 內)— Radix DismissableLayer document-level outside
        // detection 跨 portal 視為「outside」→ SelectMenu 被誤關閉。
        // 攔 `onPointerDownOutside`,檢查 click target 是否在另一個 Radix portal
        // 內,是 → preventDefault 取消 close。對齊 Ant Design Select multiSelect
        // tagRender 行為(連續移除不關 dropdown)。
        // SSOT propagation:fix 在 SelectMenu level → Combobox / 其他 SelectMenu
        // consumer 自動受益。
        // **2026-05-07 v15.16 nested portal fix**:Tag dismiss inside trigger 區的
        // OverflowIndicator HoverCard popup(獨立 Radix portal,DOM 不在 SelectMenu
        // PopoverContent 內)— Radix DismissableLayer document-level pointerdown +
        // focusin 偵測「outside」→ SelectMenu 被誤關閉。
        // 攔 `onInteractOutside`(統一 pointerdown + focusin),檢查 click target 是否
        // 在另一個 Radix portal wrapper(`[data-radix-popper-content-wrapper]`),
        // 是 → preventDefault 取消 close。對齊 Ant Design Select multiSelect tagRender
        // 行為(連續移除不關 dropdown)。
        // SSOT propagation:fix 在 SelectMenu level → Combobox / 所有 SelectMenu
        // consumer 自動受益。
        onInteractOutside={(e) => {
          const target = e.detail.originalEvent.target as HTMLElement | null
          if (target?.closest('[data-radix-popper-content-wrapper]')) {
            e.preventDefault()
          }
        }}
      >
        <Command
          shouldFilter={searchable}
          // 2026-07-06 cursor 起點修:單選已有值時 cmdk virtual focus 落在已選項而非第一項。
          // cmdk 1.1.1 初始 state 取 defaultValue、item mount 的 selectFirstItem 有
          // `state.value ||` guard 不覆蓋(dist source 驗證);Popover 關閉即 unmount(無
          // forceMount)→ 每次開啟 remount 重新生效。需搭配下方 CommandItem value={opt.value}。
          defaultValue={selectedOption?.value}
          // 2026-07-06 A11y:combobox accessible name — cmdk 永遠渲 sr-only <label htmlFor={inputId}>,
          // 僅 searchable(真的有 input)時傳,避免 orphan label 指向不存在的 input id。
          label={searchable ? searchPlaceholder : undefined}
          className="bg-transparent"
        >
          {searchable && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-1 border-b border-divider',
              size === 'lg' ? 'min-h-[calc(var(--field-height-lg)+8px)]'
                : size === 'sm' ? 'min-h-[calc(var(--field-height-sm)+8px)]'
                : 'min-h-[calc(var(--field-height-md)+8px)]',
            )}>
              <Search size={ICON_SIZE[size as 'sm' | 'md' | 'lg']} className="shrink-0 text-fg-muted" aria-hidden />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
                className={cn(
                  'flex w-full bg-transparent outline-none placeholder:text-fg-muted',
                  // M24 disabled state precedence:disabled 時 placeholder 切 fg-disabled(audit dim 34)
                  'disabled:placeholder:text-fg-disabled disabled:text-fg-disabled disabled:cursor-not-allowed',
                  size === 'lg' ? 'text-body-lg leading-compact' : 'text-body leading-compact',
                )}
              />
            </div>
          )}
          {/* **2026-05-07 v15.13 R2 fix**:minHeight 從 CommandList 搬到 CommandEmpty。
              原本 CommandList 永遠套 `minHeight = field-height × minRows + 16px`,結果
              user 過濾出 < minRows 個 match 時 list 底下空一片(eg. 打 'c' 出 2 個 match
              卻撐高到 3 row 容量,1 row 留白)。 Fix:只有 empty state 才需要 minHeight 撐
              起 placeholder 視覺;有 results 時 CommandList 自然 fit content。 */}
          {/* aria-busy(2026-07-04):loading 時標注 listbox 忙碌——兌現 select.spec.md「Loading」段
              「+ aria-busy」承諾(cmdk List 本身即 role="listbox" 容器,wrapper forward props)。 */}
          <CommandList
            className="relative"
            aria-busy={loading || undefined}
            // 2026-07-06 A11y:cmdk List 的 aria-label 由其 `label` prop 渲染(內部 spread 後 override,
            // 直接傳 aria-label 會被 cmdk default "Suggestions" 蓋掉 silent 失效)— 必走 label prop。
            label="選項" // i18n-allow: DS default; listbox accessible name
          >
            <CommandEmpty
              className="flex items-center justify-center"
              style={{ minHeight: getMenuListMinHeight(size, minRows) }}
            >
              {loading
                ? <Empty icon={<CircularProgress size={48}/>} className="py-6" />
                : <Empty description={emptyText} className="py-6" />}
            </CommandEmpty>

            {groupedOptions.map((group, gi) => (
              <React.Fragment key={group.key}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup
                  className="p-0 py-2 [&_[cmdk-group-heading]]:p-0"
                  // 2026-07-06 A11y:群組標題走 cmdk `heading`(自動產 cmdk-group-heading id,選項容器
                  // role="group" + aria-labelledby 指向之)取代手刻 child row(原本 AT 不可感知;
                  // aria-label fallback 對 role="presentation" group 無效)。[&_[cmdk-group-heading]]:p-0
                  // 中和 command.tsx base 的 px-3 py-1.5(tailwind-merge p-0 勝);字級 / 顏色由 MenuItem
                  // header 自帶(text-body leading-compact + font-medium + text-fg-muted),視覺不變。
                  heading={group.label ? <MenuItem size={size} header>{group.label}</MenuItem> : undefined}
                >
                  {group.options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      // 2026-07-06 識別值修:cmdk 以 value 當 item identity + selection state。原用
                      // opt.label → 重複 label 時雙亮 + Enter 選錯;改唯一的 opt.value,label 移入
                      // keywords 保搜尋照樣命中(cmdk filter 對 value + keywords 計分)。
                      value={opt.value}
                      keywords={opt.description ? [opt.label, opt.description] : [opt.label]}
                      disabled={opt.disabled}
                      onSelect={() => handleSelect(opt.value)}
                      // 2026-07-05 D4 P0 修:原 data-[selected=true]:bg-transparent 蓋掉 command.tsx base
                      // 的 data-[selected=true]:bg-neutral-hover = cmdk virtual focus(aria-activedescendant)
                      // 鍵盤 cursor 唯一視覺通道被抹掉 → 方向鍵移動畫面零變化(影響 Select/Combobox/PeoplePicker
                      // 全家)。鏡射 DropdownMenu wrapper pattern:互動 bg 單一 owner 在外層 CommandItem
                      //(base highlight 恢復;persistent selection 上移;selected×cursor 加深一階 —
                      // 對齊本日 DropdownMenu Q2 決策),內層 MenuItem 全透明。
                      className={cn(
                        'p-0 rounded-none',
                        !multiple && isSelected(opt.value) && 'bg-neutral-selected data-[selected=true]:bg-neutral-selected-active',
                      )}
                    >
                      <MenuItem
                        size={size}
                        startIcon={opt.icon}
                        avatar={opt.avatar}
                        description={opt.description}
                        checkbox={multiple}
                        checked={isSelected(opt.value)}
                        selected={!multiple && isSelected(opt.value)}
                        disabled={opt.disabled}
                        // 2026-07-05 D4:巢狀 role 修 — MenuItem 預設 role="option" + aria-selected(persistent
                        // selection)巢狀在 cmdk CommandItem(本身 role="option" + aria-selected=cursor)內,
                        // AT 讀到 option 包 option 且內外 aria-selected 語意相反 → 朗讀錯亂。鏡射 DropdownMenu
                        // canonical(dropdown-menu.tsx「Pure visual — Radix parent handles role/aria」):
                        // 內層純視覺 role="presentation",cmdk CommandItem 是唯一 option 節點。
                        role="presentation"
                        className="!bg-transparent hover:!bg-transparent"
                      >
                        {renderLabel ? renderLabel(opt) : opt.label}
                      </MenuItem>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}

            {/* Creatable item */}
            {showCreate && (
              <>
                <CommandSeparator />
                <CommandGroup className="p-0 py-2">
                  <CommandItem
                    // 2026-07-06:`__create__` 前綴防 identity 撞名 — 選項 row 改用 opt.value 識別後,
                    // search 恰等於某 option.value 時裸 search 會與該 row 同 value(cmdk 雙亮 + Enter
                    // 選錯)。value 含 search 子字串,cmdk filter 照樣命中;onSelect closure 讀 search
                    // 不受影響。
                    value={`__create__${search}`}
                    onSelect={() => {
                      onCreate?.(search.trim())
                      setSearch('')
                    }}
                    className="p-0 rounded-none"
                  >
                    {/* 2026-07-05 D4:同上方選項 row 的巢狀 role 修 — creatable row 同樣是
                        MenuItem 巢狀在 cmdk CommandItem(option)內,內層純視覺 role="presentation"。 */}
                    <MenuItem size={size} startIcon={Plus} role="presentation" className="!bg-transparent hover:!bg-transparent">
                      {createLabel(search.trim())}
                    </MenuItem>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/* SR 播報 empty / loading 空狀態(見 SelectMenuLiveStatus docblock,2026-07-05 D4) */}
          <SelectMenuLiveStatus loading={loading} emptyText={emptyText} />

          {/* Multi-select footer: Select All
              - 沒有選項時不顯示(selectableOptions.length === 0)
              - 搜尋有文字時不顯示(search 非空 = 使用者在找特定項目,「全選」沒意義) */}
          {multiple && selectableOptions.length > 0 && !search && (
            <MenuFooter>
              {/* 2026-07-05 D4:全選列鍵盤可達修 — 原裸 MenuItem(div 預設 role="option" 無 tabIndex)
                  位於 CommandList 之外:cmdk 方向鍵只導覽 [cmdk-item]、Tab 也到不了 div → 鍵盤使用者
                  完全無法操作全選(WCAG 2.1.1),且該 role="option" 無 listbox 祖先(orphan,axe
                  aria-required-parent)。改真實 focusable checkbox 語意:tabIndex=0 + role="checkbox" +
                  aria-checked(indeterminate → "mixed")+ Enter / Space 觸發;preventDefault 讓 cmdk root
                  onKeyDown(源碼檢查 e.defaultPrevented)不會再對 active option 重複觸發 Enter。
                  aria-selected 顯式蓋回 undefined(MenuItem 內建 aria-selected 對 role="checkbox" 無效)。 */}
              <MenuItem
                size={size}
                checkbox
                checked={allState}
                onClick={handleSelectAll}
                role="checkbox"
                aria-checked={allState === 'indeterminate' ? 'mixed' : allState}
                aria-selected={undefined}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelectAll()
                  }
                }}
              >
                {selectAllLabel}
              </MenuItem>
            </MenuFooter>
          )}
        </Command>
      </PopoverContent>
      </RowSizeProvider>
    </Popover>
  )
})

SelectMenu.displayName = 'SelectMenu'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const selectMenuMeta = {
  component: 'SelectMenu',
  family: 4,
  variants: {

  },
  sizes: {

  },
  // 'selected' = 單選 option 持續選中(bg-neutral-selected);'active' 保留 — cmdk virtual-focus on
  // selected 走 bg-neutral-selected-active(active 階 token;2026-07-07 詞彙統一補修)。
  states: ['default', 'hover', 'active', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-selected', 'bg-neutral-selected-active', 'bg-surface-raised', 'bg-transparent'],
    fg: ['text-fg-muted'],
    ring: [],
  },
} as const

/**
 * 2026-07-05 D4 P0 修(searchable 鍵盤死路):trigger 內的裸 <input> 與 portal 內的 cmdk root
 * 在不同 DOM 子樹 — 鍵盤事件永遠 bubble 不到 cmdk 的 ArrowUp/Down/Enter handler([cmdk-root]
 * onKeyDown)→ searchable Select / PeoplePicker single / Combobox searchIn='trigger' 開啟後
 * 只能 Esc。修法 = APG combobox-with-list:trigger input 把三鍵 re-dispatch 給 cmdk root
 * (native KeyboardEvent bubbles 經 React root delegation 觸發 cmdk synthetic handler)。
 * Home/End 刻意不轉送(文字輸入的 caret 語意優先,對齊 MUI/Ant Autocomplete)。
 * aria-activedescendant 綁回 trigger input → 見下方 useActiveDescendant(2026-07-05 D4 補齊)。
 */
export function forwardKeyToListbox(contentId: string | undefined, e: React.KeyboardEvent): boolean {
  if (!contentId) return false
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return false
  const root = document.getElementById(contentId)?.querySelector<HTMLElement>('[cmdk-root]')
  if (!root) return false
  e.preventDefault()
  root.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }))
  return true
}

/**
 * 2026-07-05 D4 補齊(APG combobox aria-activedescendant):追蹤 cmdk 目前 virtual-focus item
 * 的 DOM id,供 trigger 端搜尋 input 綁 `aria-activedescendant` —— SR 才會在方向鍵導覽 /
 * 打字過濾時播報 active option 名。機制:trigger 與 portal 內 cmdk 分屬不同 DOM 子樹,cmdk
 * 只把 active id 綁在自己的 Command.Input / List(cmdk source:item 自帶 auto-generated id +
 * `data-selected="true"` 標記 virtual focus)→ trigger 端用 MutationObserver 監聽 popover 容器
 * (contentId = PopoverContent id)內 `data-selected` 屬性變化 + childList(打字過濾 re-render
 * 換 item 節點),單一機制涵蓋全部更新路徑:開啟初始 auto-highlight / forwardKeyToListbox
 * 方向鍵轉送 / 搜尋過濾後 cmdk 自動移 cursor / pointer hover。
 * 關閉時清 undefined —— ARIA 要求 id 必指向存在於 DOM 的節點,不可留 stale id。
 */
export function useActiveDescendant(contentId: string | undefined, open: boolean): string | undefined {
  const [activeId, setActiveId] = React.useState<string | undefined>(undefined)
  React.useEffect(() => {
    if (!open || !contentId) {
      setActiveId(undefined)
      return
    }
    // PopoverContent 與 trigger 同一個 React commit mount(open state 同批 render)→ effect 跑時已在 DOM
    const container = document.getElementById(contentId)
    if (!container) return
    const read = () => {
      setActiveId(container.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.id || undefined)
    }
    // 初始補讀:MutationObserver 只看「觀察開始後」的變化;cmdk 初始 auto-highlight(layout effect
    // 排程)可能已 commit → rAF 讀當下狀態兜底,與 observer 互補、誰先到都不漏。
    const raf = requestAnimationFrame(read)
    const observer = new MutationObserver(read)
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-selected'] })
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [open, contentId])
  return activeId
}

export { SelectMenu }
