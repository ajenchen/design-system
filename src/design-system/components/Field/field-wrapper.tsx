import { cva } from 'class-variance-authority'

// ── Field Wrapper Styles ────────────────────────────────────────────────────
// 所有 Field 元件共用的 input wrapper 樣式。
//
// 4 種模式(2026-05-05 expand):
//   edit     — bg-surface, border, hover/focus 回饋(可編輯 input)
//   display  — 純展示(無 input chrome、無 affordance);語意「read-only 內容,展示給人看」。
//              對齊 Carbon read-only / PatternFly inline-edit hidden-input。
//   readonly — bg-disabled(neutral-2), 無邊框, 文字正常色(input chrome 但鎖定)
//   disabled — bg-disabled(neutral-2), 無邊框, 文字灰化
//
// 2 種視覺外殼(variant):
//   default — 完整 chrome(form input 場景)
//   bare    — 透明 chrome(cell-as-input substrate / Toolbar inline editing)
//
// 高度:固定 h = field-height token(rem),與 Button 共用同一組 token。

export const fieldWrapperStyles = cva(
  [
    // K10 fix(2026-05-04):`group/field` 讓 inner placeholder/text 可透過 `group-data-[field-mode=...]/field:` 變體
    //   各 Field 元件 wrapper 同時加 `data-field-mode={resolvedMode}` 屬性,bareInputStyles 即可
    //   依 mode 切 placeholder color。User canonical:disabled 顯著性優於 muted。
    'group/field',
    'inline-flex items-center w-full rounded-md',
    'text-foreground font-normal',
    'transition-colors duration-150',
  ],
  {
    variants: {
      mode: {
        edit: '',
        display: '',
        readonly: '',
        disabled: '',
      },
      variant: {
        // default — 完整 Field wrapper chrome(bg-surface、明顯 border、hover/focus 回饋)
        default: '',
        // bare — 透明 variant,hover / focus 才出現 border。適用 Toolbar inline editing
        // (FileViewer zoom input / chart config / rich text toolbar number input 等)。
        // 世界級對照:VS Code settings / Figma toolbar number / Notion prop input。
        bare: '',
        // naked — 完全無 variant,hover/focus 也不出 border。適用 cell-as-input
        // (host cell 自管 border + focus visual,內部 input 純文字承載)。
        // 世界級對照:Airtable / Notion / Excel / Google Sheets cell editing。
        naked: '',
      },
      size: {
        sm: 'text-body h-field-sm px-3 gap-2',
        md: 'text-body h-field-md px-3 gap-2',
        lg: 'text-body-lg h-field-lg px-3 gap-2',
      },
    },
    // mode x variant 交叉:visual chrome 由 compoundVariants 決定
    //
    // Overlay trigger active state(canonical 2026-05-02):當 Field 是 Popover/DropdownMenu/
    // Combobox trigger 用 asChild,Radix 自動 set `data-state="open"` on trigger root → trigger
    // 視覺維持 hover 樣式直到浮層關閉(對齊 inline-action.spec.md「狀態極簡派」)。
    compoundVariants: [
      // default variant chrome by mode
      {
        mode: 'edit',
        variant: 'default',
        className: [
          'bg-surface border border-border',
          'hover:border-border-hover',
          'focus-within:border-primary focus-within:hover:border-primary',
          'data-[state=open]:border-border-hover',
        ],
      },
      {
        mode: 'display',
        variant: 'default',
        // 純展示:無 input variant,無 hover/focus affordance(語意 = 純內容展示)
        className: 'bg-transparent border border-transparent',
      },
      {
        mode: 'readonly',
        variant: 'default',
        className: 'bg-disabled border border-transparent',
      },
      {
        mode: 'disabled',
        variant: 'default',
        className: 'bg-disabled border border-transparent cursor-not-allowed',
      },
      // bare variant chrome by mode
      {
        mode: 'edit',
        variant: 'bare',
        className: [
          'bg-transparent border border-transparent',
          'hover:border-border',
          'focus-within:border-primary focus-within:hover:border-primary',
          'data-[state=open]:border-border',
        ],
      },
      {
        mode: 'display',
        variant: 'bare',
        // bare + display:cell-as-input default state(無 variant,完全融入 cell;hover/focus 才有 affordance 等 user 點下去切 edit mode)
        className: 'bg-transparent border border-transparent',
      },
      {
        mode: 'readonly',
        variant: 'bare',
        className: 'bg-transparent border border-transparent',
      },
      {
        mode: 'disabled',
        variant: 'bare',
        className: 'bg-transparent border border-transparent cursor-not-allowed opacity-disabled',
      },
      // naked variant — cell-as-input substrate(Notion / Airtable / Excel canonical)
      //   - `!h-full`: Field 框框 = host cell box(frame 填 cell)
      //   - **edit mode 自帶 cell padding**(`!py-[var(--table-cell-py)] !px-[var(--table-cell-px)]`):
      //     host cell 在 editing 時 padding=0(讓 Field 邊框與 table divider 無縫接軌),
      //     Field 內部反向接管 padding → 內容 Y / X 位置 = display mode(切 mode 文字 0 px shift)。
      //     對齊 user canonical「框框跟 cell 一樣大並取代 cell 的框且與 table 隔線無縫接軌」。
      //   - display / readonly / disabled `!px-0 !py-0`:host cell 仍有 padding,Field 不重複加。
      //   - **edit mode 自帶 state ring**(user reminder「狀態樣式取決於原輸入框」):
      //     hover / focus-within / data-[state=open] 各自 fire border 變化(取代 cell border-r divider)
      //   - **內 alignment 從 host cell 取**(group-data-[row-mode]/cell):
      //     autoRowHeight (row-mode=auto) → !items-start(頂對齊 per spec)
      //     fixed       (row-mode=fixed) → 預設 items-center(置中 per spec)
      //     每個 mode 內 display↔edit 自然同位置(同 Field 同 group → 同 items)
      {
        mode: 'edit',
        variant: 'naked',
        className: [
          'bg-transparent border border-transparent !gap-0 !h-full',
          '!px-[var(--table-cell-px)] !py-[var(--table-cell-py)]',
          'group-data-[row-mode=auto]/cell:!items-start',
          'hover:border-border',
          'focus-within:border-primary focus-within:hover:border-primary',
          'data-[state=open]:border-border-hover',
        ],
      },
      {
        mode: 'display',
        variant: 'naked',
        className: [
          'bg-transparent border border-transparent !px-0 !py-0 !gap-0 !h-full',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      {
        mode: 'readonly',
        variant: 'naked',
        className: [
          'bg-transparent border border-transparent !px-0 !py-0 !gap-0 !h-full',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      {
        mode: 'disabled',
        variant: 'naked',
        className: [
          'bg-transparent border border-transparent cursor-not-allowed opacity-disabled !px-0 !py-0 !gap-0 !h-full',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
    ],
    defaultVariants: {
      mode: 'edit',
      variant: 'default',
      size: 'md',
    },
  }
)

// ── Bare Input Styles ───────────────────────────────────────────────────────

export const bareInputStyles = [
  'flex-1 min-w-0 bg-transparent',
  'outline-none border-none p-0',
  'text-[inherit] font-[inherit] leading-[inherit]',
  // A3 fix(2026-05-05):`<input>` UA stylesheet 強制 `text-align: start`,阻斷 parent 的
  //   `text-right`/`text-center` 繼承。顯式 `text-align: inherit` 復原(對齊 NumberCell /
  //   CurrencyCell right-align canonical:column meta.align='right' → cell text-right →
  //   input 跟著 right-align)。
  '[text-align:inherit]',
  'placeholder:text-fg-muted',
  // K10 fix(2026-05-04):wrapper data-field-mode=disabled 時,placeholder/text 都切 fg-disabled
  //   依賴 fieldWrapperStyles 的 `group/field` + 各 Field 元件 wrapper 加 `data-field-mode={resolvedMode}`
  //   User canonical:disabled state 顯著性優於 muted(neutral-6 > neutral-7)
  'group-data-[field-mode=disabled]/field:placeholder:text-fg-disabled',
  'group-data-[field-mode=disabled]/field:text-fg-disabled',
].join(' ')

// ── Empty Value Display ─────────────────────────────────────────────────────

export const EMPTY_DISPLAY = '—'
