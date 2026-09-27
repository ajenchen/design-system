/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical;spec frontmatter `isInternal`)。
 * 不進 root barrel front-door;由 Select / Combobox wrap 消費,end-user app 請用 wrapper 元件。
 */
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useControllable } from '@/design-system/hooks/use-controllable'
import type { AvatarData } from '@/design-system/components/Avatar/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandLoading, CommandGroup, CommandItem } from '@/design-system/components/Command/command'
// cmdk 的預設比對函式(公開匯出)。遠端模式 cmdk 不過濾,要自己比 ——
// 用**同一支**函式,才不會本機一套標準、遠端另一套(見下方「不限與搜尋」)。
import { defaultFilter } from 'cmdk'
import { SurfaceFooter } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { Button } from '@/design-system/components/Button/button'
import { OVERLAY_SIDE_OFFSET } from '@/design-system/tokens/elevation/overlay-geometry'
import { RowSizeProvider } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { applySelectAll, clearSelection } from '@/design-system/lib/multi-select-ordering'
// 觸發欄位 ↔ 清單的鍵盤橋接(方向鍵轉送 / aria-activedescendant / 開著按 Tab / 不可打字單選的空白鍵)住在 select-menu-keyboard.ts
import { useSelectMenuPopupKeys } from '@/design-system/components/SelectMenu/select-menu-keyboard'

/**
 * SelectMenu — Popover + Command 組成的完整下拉選單
 *
 * ── 功能 ──
 *   單選 / 多選、搜尋過濾、分組、可建立新選項（creatable）
 *   多選有 footer 全選按鈕(兩態:全選 / 取消全選)
 *
 * ── 架構 ──
 *   Popover（浮動容器）
 *     └── Command（cmdk，搜尋 + 鍵盤導覽）
 *           ├── CommandInput（搜尋列,DS 單一實作,與 CommandDialog 共用）
 *           ├── CommandList（選項列表）
 *           │     └── CommandGroup → MenuItem
 *           └── SurfaceFooter（多選:全選 / 取消全選 按鈕)
 */

// ── Types ──

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  /** icon 染色 className(2026-07-08:status 類彩色 option;M30 primitive schema 擴充) */
  iconClassName?: string
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
  /**
   * 是否在本機用搜尋字過濾選項(預設 true)。**遠端搜尋**(每打一個字就向伺服器抓、伺服器已經過濾好)傳 `false`:
   * 對應 cmdk `shouldFilter={false}`(README「Filter/sort items manually? Pass shouldFilter={false}」),與 react-select 非同步模式
   * (`filterOption: null`)/ Ant `filterOption={false}` 同款 —— 伺服器回什麼列什麼,不再被新的字二次過濾(2026-09-08 user 拍板「併」)。
   * 遠端模式下(2026-09-09 user 拍板「遠端搜尋時清掉舊選項,我覺得可以」):`optionsLoading` 期間**舊選項不顯示**(只剩載入訊息列;
   * Ant select-users 示範每次抓都 `setOptions([])`、Polaris Autocomplete 抓資料時藏 optionsMarkup),關鍵字空時顯示 `suggestions`
   * (建議群組),沒建議就一列「輸入關鍵字搜尋」提示。本機過濾不清舊清單(2026-07-04 Q3 對本機模式仍成立)。
   */
  filterOption?: boolean
  /** 可建立新選項 */
  creatable?: boolean
  /** 建立新選項 callback */
  onCreate?: (value: string) => void
  /** creatable 的 label 格式，預設 '直接使用「{query}」' */
  createLabel?: (query: string) => string
  /**
   * 受控搜尋字串(2026-07-18 決策11:讓 consumer 用**外部搜尋**(如 Select 的 trigger 內嵌 input)
   * 驅動 creatable create-row 顯隱)。傳入 = 受控(SelectMenu 不自管 search、close 不 reset,由
   * parent 負責);不傳 = 內部 uncontrolled(既有行為,零影響)。搭配 `searchable=false` +
   * `creatable` 時,SelectMenu 不畫自己的 input,但 create-row 仍依此 search 顯示。
   */
  search?: string
  /** 受控搜尋變更通知(選配;SelectMenu 內部無 input 時通常由 parent 單向驅動,不需此) */
  onSearchChange?: (value: string) => void

  /** 觸發元件（asChild） */
  children: React.ReactNode
  /** 搜尋框 placeholder */
  searchPlaceholder?: string
  /** 搜尋框 accessible name；與可見 placeholder 分離。 */
  searchAriaLabel?: string
  /** 真的沒有任何可選項目時的訊息列文案(本機過濾無結果、或遠端回傳空);預設「沒有選項」 */
  emptyText?: string
  /** 載入訊息列的可見文字(`role="status"` 直接播報;i18n:consumer 換語言時覆寫) */
  loadingText?: string
  /**
   * 遠端搜尋、關鍵字空、也沒有建議、也沒在載入時的提示列文案。預設「輸入關鍵字搜尋」。
   * 2026-09-09 user 原則:「只有實際上真的沒有任何選項可以選的時候才會顯示沒有結果的狀態」→ 還沒搜尋不是「沒有選項」。
   */
  searchHintText?: string
  /**
   * 多選 footer 的全選按鈕文字 —— **還沒全選時**顯示這個(2026-09-17 user 拍板兩段式)。
   *
   * 為什麼兩個 prop 而不是一個:W3C 的按鈕規範(https://www.w3.org/WAI/ARIA/apg/patterns/button/)
   * 逐字寫「**it is critical the label on a toggle does not change when its state changes**」——
   * 標籤會變就是普通命令按鈕、**不得加 `aria-pressed`**;要用 `aria-pressed` 則標籤必須固定。
   * 兩條路互斥,本 DS 選「標籤會變」那條,所以兩個狀態各需一段文字。
   */
  selectAllLabel?: string
  /** 多選 footer 的全選按鈕文字 —— **已全選時**顯示這個,點下去清空(見 `selectAllLabel` 的規範依據)。 */
  deselectAllLabel?: string
  /**
   * 多選:在清單最上面加一列「不限」(2026-09-18 user 拍板)。**預設關**,由消費端自行開啟 ——
   * 形狀比照同檔的 `creatable` / `searchable`(都是 opt-in boolean + 另一個 label prop)。
   *
   * **為什麼預設關**(user 原話):「消費端要自行判斷到底選單的內容是否要出現不限這個選項啊,
   * 我們又不知道消費端的選單內容,直接開啟反而容易變成怪設計」—— 這是**語意判斷**,DS 判斷不了。
   * 何時該開 / 不該開見 `select-menu.spec.md`「何時用 / 何時不用」。
   *
   * **「不限」不是「全選」**:全選是「現在清單上這些」,不限是「不設限,含以後新增的選項」。
   * 所以它是一個**獨立的值**,不會被展開成具體選項,也不會因為使用者手動勾滿就自動變成它。
   *
   * 只在 `multiple` 時有作用。
   */
  unrestricted?: boolean
  /** 「不限」那一列的文字。預設「不限」。欄位上顯示的字與這裡**同一個來源**,不會兩邊各寫各的。 */
  unrestrictedLabel?: string
  /**
   * 「不限」在 value 陣列裡的保留值。預設 `__unrestricted__`。
   *
   * 前綴形式比照同檔可建立列的 `__create__`(見該處註解:防與真實 option.value 撞名)。
   * 消費端的選項如果真的用了這個字串,改這個 prop 換一個;開發模式會在撞名時警告。
   */
  unrestrictedValue?: string
  /**
   * **選項清單**載入中(2026-09-09 user 拍板改名,原 `loading`;理由:DS 內 `loading` 已被 Field 家族佔走 =
   * 「這個值」在讀取 / 驗證 / 儲存(field-controls.spec.md「Loading state」),同字兩義是 2026-09-08 兩顆轉圈的病根)。
   * 指示**只在選單內**:清單裡沒有任何可顯示的選項時,Empty 槽渲載入訊息列(`CommandLoading`:同「沒有結果」的
   * MenuItem 訊息列,前綴槽轉圈 + loadingText,`role="status"`);觸發點 / 搜尋列**不**為選項轉圈(MUI Autocomplete
   * `loading` 只在 options 空時顯 loadingText;Polaris Autocomplete `loading` → `Listbox.Loading` 在清單內,TextField 不轉)。
   * 本機過濾(`filterOption` 預設 true)已有選項時保留顯示、選單不關;遠端(`filterOption={false}`)抓資料中舊選項不顯示
   * (見 `filterOption`)。listbox 同時標 `aria-busy`。
   */
  optionsLoading?: boolean
  /**
   * 遠端搜尋(`filterOption={false}`)關鍵字空時顯示的**建議清單**(部分選項:最近用過 / 常用 / 伺服器先給幾筆),
   * 2026-09-09 user 拍板。對應 react-select `defaultOptions`(「The default set of options to show before the user starts
   * searching」,useAsync.ts)。DS 自動包成有標題的群組(`suggestionsLabel`,預設「建議」)—— 原則:**讓使用者明確知道實際
   * 的選項不只選單上這幾筆**;要自訂分組(「最近指派」「同團隊」)就在項目上填 `group` + `groups`,每組都有標題、沒填 group
   * 的仍歸「建議」。關鍵字非空 → 換顯示 `options`(伺服器結果)。不傳(undefined)→ 關鍵字空時退回顯示 `options`
   * (遠端模式下同樣加「建議」標題);本機過濾模式忽略本 prop(完整清單不需要建議,分組用 `groups`)。
   */
  suggestions?: SelectMenuOption[]
  /** 建議群組的標題(預設「建議」;cmdk List 的預設 aria-label 就叫 Suggestions) */
  suggestionsLabel?: string

  /** 尺寸 */
  size?: SizeKey
  /** 對齊方式 */
  align?: 'start' | 'end'
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

  /**
   * 浮層 accessible name(2026-07-17 Dim 10 a11y 修)。Radix Popover 的 content 為
   * `role="dialog"` 但無自動命名機制 → 無 aria-label 時 dialog 無 accessible name。
   * 預設「選項清單」讓 SR 使用者知道浮層用途;consumer(Combobox / Select / PeoplePicker)
   * 可傳更 contextual 的名(如欄位名)。SSOT 放此一處 → 全 SelectMenu consumer 受益。
   */
  'aria-label'?: string

  className?: string
}

// SR 播報(empty)由 Command 根自動渲(2026-09-08 搬進 Command → 2026-09-09 根內建);loading 由可見的 CommandLoading role="status" 播。

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
  filterOption = true,
  creatable = false,
  onCreate,
  createLabel = (q) => `直接使用「${q}」`,
  search: controlledSearch,
  onSearchChange,
  children,
  searchPlaceholder = '搜尋…', // i18n-allow: DS default; consumer override via searchPlaceholder prop
  searchAriaLabel = '搜尋選項', // i18n-allow: DS default; consumer override via searchAriaLabel prop
  emptyText = '沒有選項', // i18n-allow: DS default(2026-09-08 user 拍板:一句到底,對應 No options;打開就沒選項與搜尋無結果共用);consumer override via emptyText prop
  loadingText = '載入選項中', // i18n-allow: DS default; consumer override via loadingText prop
  searchHintText = '輸入關鍵字搜尋', // i18n-allow: DS default(2026-09-09:遠端搜尋還沒打字、也沒建議時的提示);consumer override via searchHintText prop
  selectAllLabel = '全選', // i18n-allow: DS default; consumer override via selectAllLabel prop
  deselectAllLabel = '取消全選', // i18n-allow: DS default; consumer override via deselectAllLabel prop
  unrestricted = false,
  unrestrictedLabel = '不限', // i18n-allow: DS default; consumer override via unrestrictedLabel prop
  unrestrictedValue = '__unrestricted__',
  optionsLoading = false,
  suggestions,
  suggestionsLabel = '建議', // i18n-allow: DS default(2026-09-09 user 拍板「群組標題名叫 Suggestion 之類的」);consumer override via suggestionsLabel prop
  size = 'md',
  align = 'start',
  minWidth,
  open: controlledOpen,
  defaultOpen,
  onOpenChange: controlledOnOpenChange,
  renderLabel,
  onOpenAutoFocus,
  contentId,
  'aria-label': ariaLabel = '選項清單', // i18n-allow: DS default; consumer override via aria-label prop
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
  // search:選配受控(決策11)。傳 `search` prop = 受控(parent 驅動,如 Select trigger input);
  // 不傳 = 內部 uncontrolled(既有行為)。setSearch 同步內部 + 通知 onSearchChange。
  const isSearchControlled = controlledSearch !== undefined
  const [internalSearch, setInternalSearch] = React.useState('')
  const search = isSearchControlled ? controlledSearch : internalSearch
  const setSearch = React.useCallback(
    (next: string) => {
      if (!isSearchControlled) setInternalSearch(next)
      onSearchChange?.(next)
    },
    [isSearchControlled, onSearchChange],
  )

  // ── 清單來源(2026-09-09 user 拍板;owner:select-menu.spec.md「遠端搜尋」「Suggestions」)──
  // 本機過濾:永遠是 options(cmdk 自己過濾;舊清單不清)。
  // 遠端搜尋(filterOption=false):
  //   關鍵字空 + 有給 suggestions → 建議清單(部分選項,DS 加「建議」標題);
  //   抓資料中 → 舊 options 不顯示(只剩載入訊息列;Ant select-users 示範 setOptions([]) / Polaris 藏 optionsMarkup;
  //     react-select useAsync 第一次搜尋 `setPassEmptyOptions(!loadedInputValue)` 同樣清空);
  //   其餘 → options(伺服器結果;關鍵字空時也視為部分清單,加「建議」標題)。
  const isRemote = !filterOption
  const isIdle = search.trim() === ''
  const visibleOptions = React.useMemo<SelectMenuOption[]>(() => {
    if (!isRemote) return options
    if (isIdle && suggestions !== undefined) return suggestions
    return optionsLoading ? [] : options
  }, [isRemote, isIdle, suggestions, optionsLoading, options])
  // 遠端 + 關鍵字空 + 有東西可列 = 部分清單 → 必有群組標題,讓使用者知道選項不只這些(2026-09-09 user 原則)
  const showSuggestionHeading = isRemote && isIdle && visibleOptions.length > 0

  // ── 不限:什麼時候出現(2026-09-18 user 拍板)────────────────────────────────
  //
  // 兩條各自獨立的規則:
  //
  // **(a) 三種訊息列的情境一律不出現**(user 原話:「這三種狀態有需要出現不限的選項嗎?應該不用
  // 出現吧」)——載入中 / 清單真的沒東西 / 遠端還沒打字。這一條由 `!optionsLoading` 與閒置時的
  // `visibleOptions.length > 0` 兩個條件落地。
  //
  // **(b) 搜尋時,跟一般選項一樣照關鍵字配對**(user 原話:「如果要可以搜得到,不是應該遠端和
  // 非遠端都搜得到嗎?但前提是關鍵字要有配對到吧?然後遠端搜尋的話,應該要等結果都回傳回來了
  // 才一起跟其他一般選項同時秀出?」)。
  //   本機(cmdk 自己過濾):照渲染出來,cmdk 用 `value` + `keywords` 比,跟其他選項同一套規則。
  //   遠端(`shouldFilter={false}`,cmdk 不過濾):cmdk 幫不上忙,自己用**同一支** `defaultFilter`
  //     比一次;「等結果回傳」由 `!optionsLoading` 保證(載入中不出現)。
  //
  // 2026-09-18 之前這裡寫的是 `isIdle`(搜尋框一有字就整列不渲染)。那不是 user 說的,是我自己
  // 放寬的 —— 後果是打「不限」兩個字會得到「沒有選項」,而那一列上一秒還在第一行(實測),
  // 同時我傳的 `keywords` 變成永遠到不了的死碼。
  //
  // 這個條件同時解掉一個**不做就會無聲壞掉**的問題:cmdk 的訊息列只在「筆數 = 0」時渲
  //(`node_modules/cmdk`:`P(u => u.filtered.count === 0) ? <div cmdk-empty> : null`)。
  // 本機模式「不限」是一顆會被註冊、也會被過濾的普通列,筆數自然正確;遠端模式不過濾,
  // 但它只在配對到時才渲染,所以「沒有選項」該出現的時候仍然出得來。兩邊都不需要 `forceMount`
  //(那會讓它不被計入筆數,反而造成「不限 + 沒有選項」同時出現)。
  const unrestrictedMatchesSearch = isIdle
    ? visibleOptions.length > 0
    : !isRemote || defaultFilter(unrestrictedValue, search, [unrestrictedLabel]) > 0
  const showUnrestricted = multiple && unrestricted && !optionsLoading && unrestrictedMatchesSearch

  // 開發模式警告:保留值跟真實選項撞名 → cmdk 以 value 當 identity,撞名會雙亮 + 選錯(同 `__create__` 的病)
  if (process.env.NODE_ENV !== 'production' && unrestricted && options.some((o) => o.value === unrestrictedValue)) {
    console.warn(`[SelectMenu] unrestrictedValue「${unrestrictedValue}」跟某個選項的 value 撞名了,改傳一個不會撞的 unrestrictedValue。`)
  }
  // 開發模式警告:開了「不限」卻一個可選選項都沒有 = 這個選單根本不給選,設定本身沒有意義
  //(user 原話:「那就表示這個東西根本不給選啊,怪設計」)
  if (process.env.NODE_ENV !== 'production' && unrestricted && multiple && !isRemote && options.length === 0) {
    console.warn('[SelectMenu] 開了 unrestricted 但一個選項都沒有 —— 只有「不限」可選的選單沒有意義,請確認選項來源。')
  }

  // ── Value helpers ──
  const selectedValues = React.useMemo<string[]>(() => {
    if (value == null) return []
    return Array.isArray(value) ? value : [value]
  }, [value])

  const isSelected = React.useCallback(
    (v: string) => selectedValues.includes(v),
    [selectedValues]
  )

  // 反白(cmdk 游標)的長相由 CommandItem 依反白來歷分流(滑鼠搬的 → 底色 / 鍵盤搬的 → 框;SSOT = hooks/use-input-modality.ts
  // `useCursorMover`,focus-canonical 規則一「兩類元件」)。開啟時的落點沒有人搬過,用開啟那一下的輸入畫(滑鼠點開 → 底色、鍵盤開 → 框)。
  // 2026-07-05 P2:單選已選 option — 供 cmdk defaultValue 定 cursor 起點(見下方 <Command>)
  const selectedOption = React.useMemo(
    () => (!multiple ? visibleOptions.find((o) => o.value === selectedValues[0]) : undefined),
    [multiple, visibleOptions, selectedValues]
  )

  // 「不限」目前是不是被選著 —— 放在 `selectedValues` 之後(它依賴那個值)。
  const isUnrestrictedSelected = multiple && unrestricted && selectedValues.includes(unrestrictedValue)

  const handleSelect = React.useCallback(
    (optionValue: string) => {
      if (multiple) {
        // 互斥(2026-09-18 user 拍板三條):
        //   勾「不限」→ 清掉所有一般選項(值就只剩「不限」自己)
        //   勾任一一般選項 → 取消「不限」
        //   取消「不限」→ 回到**未選**(不還原上一批,user 原話「回到未選狀態」)
        // 寫在同一個 handler 裡而不是另抽一層:欄位上的 Tag × 與一鍵清空都碰不到「不限」
        //(「不限」不渲成 Tag,所以沒有它的 ×;清空是整個清成空陣列,把它一起清掉本來就對),
        // 所以唯一會改到「不限」的入口就是這裡。
        // `unrestricted` 關著時這整段必須是**結構上惰性**,不能只是「實務上碰不到」:
        // `unrestrictedValue` 有預設值,關著時若消費端剛好有個選項的值就叫 `__unrestricted__`,
        // 沒包這層 guard 的話選別的選項會把它靜默吃掉(2026-09-18 自查補)。
        const withoutUnrestricted = (values: string[]) =>
          unrestricted ? values.filter((v) => v !== unrestrictedValue) : values
        const isUnrestrictedRow = unrestricted && optionValue === unrestrictedValue
        let next: string[]
        if (isUnrestrictedRow) {
          next = isSelected(optionValue) ? [] : [unrestrictedValue]
        } else if (isSelected(optionValue)) {
          next = selectedValues.filter((v) => v !== optionValue)
        } else {
          next = [...withoutUnrestricted(selectedValues), optionValue]
        }
        onValueChange?.(next)
      } else {
        onValueChange?.(optionValue)
        setOpen(false)
      }
    },
    [multiple, selectedValues, isSelected, onValueChange, setOpen, unrestricted, unrestrictedValue]
  )

  // ── Multi-select: select all ──
  // 遠端搜尋不提供全選(清單永遠是部分選項,「全部」會是假話;footer 條件見下方)
  const selectableOptions = React.useMemo(
    () => visibleOptions.filter((o) => !o.disabled),
    [visibleOptions]
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
      // 先把「不限」濾掉再交給 `applySelectAll`(2026-09-18):那支共用工具的語意是
      // 「保留既有 + 追加未選」(`multi-select-ordering.ts:48-52`,回傳 `[...existing, ...unselected]`),
      // 不濾的話「不限」會跟全部一般選項並存 —— 同時違反互斥與「全選只看一般選項」兩條。
      // **不改那支工具**:它是通用排序規則(對齊 Ant Transfer 的既有決議),別的使用者也在吃。
      // 同上:關著時不過濾,這條路徑對既有行為完全零影響。
      // (2026-09-18 實測:這一條單獨拿掉不會被閘抓到 —— `applySelectAll` 的語意是「保留既有 +
      //  追加未選」,撞名的那個本來就在 options 裡,濾掉後又被追加回來。留 guard 是為了語意一致,
      //  真正會靜默吃掉值的是上面 handleSelect 那條。)
      const existing = unrestricted ? selectedValues.filter((v) => v !== unrestrictedValue) : selectedValues
      onValueChange?.(applySelectAll(existing, selectableOptions.map((o) => o.value)))
    }
  }, [multiple, allState, selectableOptions, selectedValues, onValueChange, unrestricted, unrestrictedValue])

  // ── Creatable ──
  const showCreate = React.useMemo(() => {
    if (!creatable || !search.trim()) return false
    // 遠端抓資料中不出建立列:結果還沒回來,不能判斷要不要建立(否則建到伺服器已有的東西;Codex R13 反例)
    if (isRemote && optionsLoading) return false
    const q = search.trim().toLowerCase()
    // 同名防重複要連建議清單一起查(建議也是真實選項;Codex R13 反例:建議有 Alice 仍出現「直接使用 Alice」)
    // 本機過濾模式忽略 suggestions(spec「Suggestions」最後一條),所以只有遠端模式才連建議一起查(Codex R14 反例:本機 + 建議同名誤藏建立列)
    return !options.some((o) => o.label.toLowerCase() === q) && !(isRemote && (suggestions ?? []).some((o) => o.label.toLowerCase() === q))
  }, [creatable, search, options, suggestions, isRemote, optionsLoading])

  // ── Grouping ──
  // 沒填 group 的項目歸預設群組;預設群組在「建議」情境下必有標題(suggestionsLabel),其他情境無標題。
  const groupedOptions = React.useMemo(() => {
    const defaultLabel = showSuggestionHeading ? suggestionsLabel : ''
    if (!groups?.length) return [{ key: '__default', label: defaultLabel, options: visibleOptions }]
    const grouped = groups.map((g) => ({
      ...g,
      options: visibleOptions.filter((o) => o.group === g.key),
    }))
    const ungrouped = visibleOptions.filter((o) => !o.group)
    if (ungrouped.length) {
      grouped.unshift({ key: '__default', label: defaultLabel, options: ungrouped })
    }
    return grouped
  }, [groups, visibleOptions, showSuggestionHeading, suggestionsLabel])

  // ── Reset search on close(僅 uncontrolled;受控時由 parent 負責 reset)──
  React.useEffect(() => {
    if (!open && !isSearchControlled) setInternalSearch('')
  }, [open, isSearchControlled])

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

  // 開著按 Tab / Shift+Tab(2026-09-25 待辦總帳 B11;W3C / Fluent 出處與理由見 select-menu-keyboard.ts):
  // 單選 = 選定反白那一項 + 收起 + 焦點從觸發欄位往下 / 往上走;多選(有全選的小面板)= Tab 留在面板裡,行為不變。
  // 不可打字的單選:空白鍵 = 選這一項,同 Enter(2026-09-26 待辦總帳 L7;出處同檔)。
  const popupKeys = useSelectMenuPopupKeys({
    open, multiple, isSelected, commit: handleSelect, close: () => setOpen(false),
    // 反白列的 data-value(cmdk 已 trim)→ 可選選項值;建立列 / disabled 不算 —— Tab 不替使用者建立新選項
    resolveOptionValue: (dataValue) => visibleOptions.find((o) => !o.disabled && o.value.trim() === dataValue)?.value,
  })

  // RowSizeProvider 讓 PopoverContent 子樹內任何 <ItemIcon> / <ItemAvatar> /
  // <ItemInlineAction> 都自動讀到對的 size,跟 SidebarProvider / TreeView 同一條規則。
  // (注:Popover 透過 Portal 渲染,context 仍然會跨 portal 傳遞——React context 是 tree-based
  // 不是 DOM-based,Portal 不影響 context propagation)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* B11:可打字搜尋時焦點在觸發欄位內的輸入框,Tab 規則要掛在這裡(不可打字時掛在下方 Command) */}
      <PopoverTrigger asChild ref={popupKeys.triggerRef} onKeyDown={popupKeys.onKeyDown}>{children}</PopoverTrigger>
      <RowSizeProvider value={size}>
      <PopoverContent
        ref={popupKeys.contentRef}
        id={contentId}
        // B11:Tab 收起時不讓 Radix 在關閉動畫後把焦點搶回觸發欄位(焦點已走到下一格)
        onCloseAutoFocus={popupKeys.onCloseAutoFocus}
        // 2026-07-17 Dim 10 a11y 修:role="dialog" 浮層 accessible name(Radix Popover 無自動命名)
        aria-label={ariaLabel}
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
          // B11 / L7:不可打字時焦點在浮層裡(cmdk 殼 / 清單),Tab 與空白鍵的規則掛在這裡
          onKeyDown={popupKeys.onKeyDown}
          shouldFilter={searchable && filterOption}
          // 2026-07-06 cursor 起點修:單選已有值時 cmdk virtual focus 落在已選項而非第一項。
          // cmdk 1.1.1 初始 state 取 defaultValue、item mount 的 selectFirstItem 有
          // `state.value ||` guard 不覆蓋(dist source 驗證);Popover 關閉即 unmount(無
          // forceMount)→ 每次開啟 remount 重新生效。需搭配下方 CommandItem value={opt.value}。
          defaultValue={selectedOption?.value}
          // 2026-07-06 A11y:combobox accessible name。2026-07-14 修正註解(cmdk 1.1.1 dist 實證):
          // cmdk **無條件**渲 sr-only <label htmlFor={inputId}>(dist/index.mjs
          // `createElement("label",{htmlFor:U.inputId,id:U.labelId,...},b)` — label prop 只決定
          // 文字內容,不決定 label 元素是否渲染)。故 non-searchable 時「空 label + htmlFor 指向
          // 不存在的 input」仍存在(upstream cmdk 限制;空 label 無 accessible name,不產生朗讀
          // 內容)。僅 searchable(真的有 input)時傳內容 = 避免 non-searchable 帶 search
          // placeholder 的 accessible name 卻無對應 input;真要消除 orphan label 需 upstream 修。
          label={searchable ? searchAriaLabel : undefined}
          size={size}
        >
          {searchable && (
            // 2026-09-08:搜尋列改用 DS `CommandInput`(與 CommandDialog / inline Command 同一份實作),
            // 原本這裡自己寫一份 raw cmdk input + icon wrapper = 第二份 SSOT(user 抓「Command 跟 SelectMenu 不同一套」)。
            // 搜尋列不為「選項載入」轉圈(2026-09-09 user 拍板:選項載入的指示只在選單內;Polaris Autocomplete loading 時 TextField 不轉)
            <CommandInput size={size as 'sm' | 'md' | 'lg'} placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          )}
          {/* **2026-05-07 v15.13 R2 fix**:minHeight 從 CommandList 搬到 CommandEmpty。
              原本 CommandList 永遠套 `minHeight = field-height × minRows + 16px`,結果
              user 過濾出 < minRows 個 match 時 list 底下空一片(eg. 打 'c' 出 2 個 match
              卻撐高到 3 row 容量,1 row 留白)。 Fix:只有 empty state 才需要 minHeight 撐
              起 placeholder 視覺;有 results 時 CommandList 自然 fit content。 */}
          {/* aria-busy(2026-07-04):optionsLoading 時標注 listbox 忙碌——兌現 select.spec.md「Loading」段
              「+ aria-busy」承諾(cmdk List 本身即 role="listbox" 容器,wrapper forward props)。 */}
          {/* 訊息列三態(2026-09-09 user 拍板;cmdk Empty 只在 0 筆可顯示時渲):
              抓資料中 → 載入列;遠端 + 關鍵字空(沒建議)→ 「輸入關鍵字搜尋」;真的沒有任何可選 → emptyText */}
          <CommandEmpty size={size}>
            {optionsLoading
              ? <CommandLoading label={loadingText} size={size} />
              : isRemote && isIdle ? searchHintText : emptyText}
          </CommandEmpty>
          <CommandList
            className="relative"
            aria-busy={optionsLoading || undefined}
            // 2026-07-06 A11y:cmdk List 的 aria-label 由其 `label` prop 渲染(內部 spread 後 override,
            // 直接傳 aria-label 會被 cmdk default "Suggestions" 蓋掉 silent 失效)— 必走 label prop。
            label="選項" // i18n-allow: DS default; listbox accessible name
          >
            {/* 空狀態與 loading 的置中、最小高度都由 CommandEmpty own(2026-09-08);這裡只給內容 */}

            {/* 「不限」(2026-09-18 user 拍板)——**清單的第一組**。
                一組只有一列,靠 `CommandGroup` 自己的 `py-2`(上下 8px)與「跟在另一個可見群組後面就畫上邊線」
                的規則,自動跟下面那組一般選項用分隔線隔開 —— 分隔線畫在**後面那組的頂端**
                (`Command/command.tsx:263-268`,判準 owner `patterns/element-anatomy/item-anatomy.spec.md`
                「Group auto-separation」),所以這裡不插 Separator、不寫新 CSS。
                結構先例是同一支檔案下方的可建立列:同樣是無標題、單獨一列、自成一組,只是它在最下面。

                **為什麼用 `CommandGroup` 不是 `MenuGroup`**:這一列**是選項**,要點得到、鍵盤上下鍵走得到。
                `MenuGroup` 的列不經 cmdk 註冊(那正是訊息列選它的理由,見 `command.tsx:187-189`),
                放這裡會變成鍵盤走不到的孤兒,而且它的相鄰線用 `[&+&]`(同 class 相鄰)也對不上 `CommandGroup`。

                出現條件見上方 `showUnrestricted`。 */}
            {showUnrestricted && (
              <CommandGroup>
                <CommandItem
                  value={unrestrictedValue}
                  keywords={[unrestrictedLabel]}
                  onSelect={() => handleSelect(unrestrictedValue)}
                  checkbox
                  checked={isUnrestrictedSelected}
                  // 這列不是「一個選項」而是「不設限」,所以任何「算有幾個選項 / 是不是全選了」的東西
                  // 都必須把它排除掉。給它一個**結構性**記號,不要去比對 `unrestrictedValue` ——
                  // 那是消費端可以改的字串(prop),拿字串當判準等於把判準交給呼叫端。
                  // 消費者:scripts/select-all-footer-invariant.mjs 的分母。
                  data-unrestricted=""
                >
                  {unrestrictedLabel}
                </CommandItem>
              </CommandGroup>
            )}

            {/* 選項為 0 的群組不畫(2026-09-08):cmdk 在 shouldFilter=false(搜尋在觸發點)時不會藏空群組,
                會留下 py-2 的 16px 空白疊在「沒有選項」下面(實測 128 vs 應為 112)。 */}
            {groupedOptions.filter((group) => group.options.length > 0).map((group) => (
              <React.Fragment key={group.key}>
                {/* 群組之間的分隔線由 CommandGroup 自動畫(item-anatomy「Group auto-separation」:consumer 不手插 Separator;
                    2026-09-08 修:cmdk 在搜尋字非空時不渲 Separator,手插版會讓可見群組之間沒線)。 */}
                <CommandGroup
                  key={group.key}
                  // 內距與標題(MenuItem header,吃 Command 的 size context)都由 CommandGroup own(2026-09-08)
                  heading={group.label || undefined}
                >
                  {group.options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      // cmdk 以 value 當 identity;label 進 keywords 保搜尋命中(2026-07-06)
                      value={opt.value}
                      keywords={opt.description ? [opt.label, opt.description] : [opt.label]}
                      disabled={opt.disabled}
                      onSelect={() => handleSelect(opt.value)}
                      // 視覺 anatomy(icon / avatar / description / checkbox / 選中 × 鍵盤框、內層 role=presentation)
                      // 全在 CommandItem 內的 MenuItem(2026-09-08 收斂,原本這裡自己再包一層 MenuItem + 手刻選中框)
                      startIcon={opt.icon}
                      startIconClassName={opt.iconClassName}
                      avatar={opt.avatar}
                      description={opt.description}
                      checkbox={multiple}
                      checked={isSelected(opt.value)}
                      selected={!multiple && isSelected(opt.value)}
                    >
                      {renderLabel ? renderLabel(opt) : opt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}

            {/* Creatable item */}
            {showCreate && (
              <>
                <CommandGroup>
                  <CommandItem
                    startIcon={Plus}
                    // 2026-07-06:`__create__` 前綴防 identity 撞名 — 選項 row 改用 opt.value 識別後,
                    // search 恰等於某 option.value 時裸 search 會與該 row 同 value(cmdk 雙亮 + Enter
                    // 選錯)。value 含 search 子字串,cmdk filter 照樣命中;onSelect closure 讀 search
                    // 不受影響。
                    value={`__create__${search}`}
                    onSelect={() => {
                      onCreate?.(search.trim())
                      setSearch('')
                    }}
                  >
                    {createLabel(search.trim())}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>

          {/* SR 播報 0 筆(2026-09-09):由 Command 根自動渲(文字 = 上面 CommandEmpty 的字串 children),這裡不再另放,放了會播兩次 */}

          {/* Multi-select footer(2026-09-17 user 拍板 A 案:列式 footer + 三態勾選列 → SurfaceFooter + 兩態按鈕)
              顯示條件**完全沿用原本的邏輯**,一條沒動:
              - 沒有可選項時不顯示(selectableOptions.length === 0)
              - 搜尋有文字時不顯示(search 非空 = 使用者在找特定項目,「全選」沒意義)
              - 遠端搜尋不顯示(2026-09-09):清單永遠是部分選項(建議 / 伺服器結果),「全部」語意不成立

              **為什麼是 SurfaceFooter 而不是原本的 MenuFooter**:底部放的是**按鈕**不是整列 ——
              判準見 `patterns/overlay-surface/overlay-surface.spec.md`「底部區域:按鈕列 vs 列式」。
              `justify-between` 讓左側放操作選取的按鈕(全選 / 未來的重設)、右側留給提交類(未來的套用);
              先例:`components/Coachmark/coachmark.tsx` 已用同一手法。

              **左右內距覆寫成 `--item-px`,不用 SurfaceFooter 預設的 loose**:規則是「footer 對齊**這個浮層的內容左邊界**」
              (判準與全庫實測對照表在 `patterns/overlay-surface/overlay-surface.spec.md`「要對齊誰」)。
              在這個元件裡定義那條左邊界的是**列** —— SelectMenu 整份檔案沒有 SurfaceHeader / PopoverHeader,列就是內容的最左緣。
              而列的內距就是 `--item-px`:裸選單是預設 12px,放進有 chrome 的浮層時由容器在 Command 根設成
              `var(--layout-space-loose)`(16px,見 `Popover/popover.stories.tsx` 與 `Dialog/dialog.stories.tsx`)。
              兩種情境都讀同一個 token,按鈕左緣就永遠貼齊列的前緣,不會有第二個數字要同步(M17)。
              2026-09-17 錨:一開始沿用 `SurfaceFooter` 預設的 `px-loose`,在**沒有 header 的一般下拉選單**裡
              按鈕左緣 33px、列前緣 29px,差 4px 肉眼看得出來 —— 「對齊 header 標題」那句話在這個元件不成立,
              因為它沒有 header。機械閘:`scripts/overlay-footer-gutter-invariant.mjs`(量像素,全 story 掃)。

              **a11y:普通命令按鈕,標籤會變,不加 `aria-pressed`** —— W3C 按鈕規範
              (https://www.w3.org/WAI/ARIA/apg/patterns/button/)逐字:「it is critical the label on a toggle
              does not change when its state changes」;標籤會變與 `aria-pressed` 兩條路互斥,本 DS 選前者。
              原本那一列的三態(`aria-checked="mixed"`)隨之消失 —— user 2026-09-17 拍板不補計數,
              理由:選了幾個在欄位本體一目了然,溢出還有數字提示。
              2026-07-05 D4 修的兩個問題(WCAG 2.1.1 鍵盤可達、孤兒 `role="option"`)由 `<Button>` 天然解決:
              它是真的 `<button>`,本來就在 Tab 序裡、本來就不是 option。cmdk root 的 Enter 攔截只對
              `[cmdk-item]` 的反白項派送,按鈕的 Enter 由瀏覽器原生處理,不需要再 preventDefault。 */}
          {multiple && !isRemote && selectableOptions.length > 0 && !search && (
            <SurfaceFooter className="justify-between px-[var(--item-px,var(--field-px))]">
              <Button
                variant="tertiary"
                size="sm"
                onClick={handleSelectAll}
              >
                {allState === true ? deselectAllLabel : selectAllLabel}
              </Button>
            </SurfaceFooter>
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
  // 2026-07-14 修 family 自我矛盾:原 Phase-1 mechanical 填 4(Field control),與 spec body
  // 「Layout Family:非上述 family — composite / multi-section」矛盾。SelectMenu 是 Popover +
  // Command composite overlay(trigger 由 consumer Select / Combobox own,Family 4 是 trigger
  // 側 field control 的事);對齊 DS composite 慣例(Accordion / Command / Popover meta 皆
  // family: null + spec frontmatter composite)。
  family: null, // non-family composite / overlay(對齊 spec frontmatter composite)
  variants: {

  },
  sizes: {

  },
  // 'selected' = 單選 option 持續選中(bg-neutral-selected);選中項的鍵盤反白(cmdk virtual-focus,
  // 非 hover)自 2026-09-07 起**畫框**而非深一階底色(user 拍板「A5畫框」;底色已被選中佔走)。
  states: ['default', 'hover', 'active', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-selected', 'bg-surface-raised', 'bg-transparent'],
    fg: ['text-fg-muted'],
    ring: ['focus-ring-inset'],
  },
} as const

// forwardKeyToListbox / useActiveDescendant 原樣搬到 select-menu-keyboard.ts(2026-09-25,與 B11 的 Tab 規則同住一個
// 鍵盤模組;本檔已近 800 行上限)。從這裡轉出,Select / Combobox 既有的 import 路徑不變。
export { forwardKeyToListbox, useActiveDescendant } from '@/design-system/components/SelectMenu/select-menu-keyboard'

export { SelectMenu }
