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
          // 2026-05-06 v13.3 SSOT canonical:focus-within `!important` 強制勝過 data-state attribute
          // selector(specificity tie at 0,2,0;source order 後者勝)。
          //
          // 設計原則:**focus dominates everything**(M11 fix「focus-dominates-hover」延伸成
          // 「focus-dominates-{hover,open,error-rest}」)。Cursor 在輸入框 = user 編輯中 = 必藍。
          //
          // 對齊世界級三家共識:
          //   - Material Design 3:focus → primary line color
          //   - Polaris(Shopify):focus state border-focus(藍)overrides hover/open
          //   - Ant Design 5:`.ant-select-focused` blue,popover open + select option close 後
          //     trigger 仍 focused → blue stays(focus return canonical via Radix `onCloseAutoFocus`)
          //
          // 副作用 — Ant 風「選後藍 / 取消灰」自動達成:
          //   - 選 option close popover → Radix focus return to trigger → focus-within fires → 藍
          //   - 點外取消 close popover → focus 移外 → focus-within 不 fire → 灰
          'focus-within:!border-primary focus-within:hover:!border-primary',
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
          // 同 default chrome v13.3 SSOT:focus-within !important 強制勝過 data-state
          'focus-within:!border-primary focus-within:hover:!border-primary',
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
      //
      // ── 2026-05-06 v14:revert v12 → v9 baseline + keep v13.3 ──
      // v12 `!absolute -inset-px` autoRowHeight 不相容(Field 抽 layout flow → cell 塌 42px;
      // user production 報「Field 沒撐滿 cell, 比沒改之前還糟糕一百萬倍」)→ revert。
      //
      // v14 = v9 baseline border-based state machine + v13.3 focus !important。
      // 暫接受視覺:Field.border-l 跟 prev cell.border-r 視覺 2px 雙線(待另案研究 seamless
      // 方案,約束:SSOT 留 Field state machine + ring 顏色自動跟 border state 同步)。
      {
        mode: 'edit',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !gap-0 !h-full',
          '!px-[var(--table-cell-px)] !py-[var(--table-cell-py)]',
          'border border-border',
          'hover:border-border-hover',
          // v13.3 SSOT canonical:focus-within !important(同 default + bare)
          'focus-within:!border-primary focus-within:hover:!border-primary',
          'data-[state=open]:border-border-hover',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      {
        // **2026-05-07 v15.12 revert Bug F**:Display mode 改回 baseline canonical —
        // Field naked-display 透明 border,padding=0(host cell 自帶 cellPadding),hover
        // ring 由 cell wrapper outline (`nakedCellEditableDisplayHover`) 提供。
        // 為何不走 Field DOM border SSOT(v15.10 嘗試):wrap path(`<span break-words>`
        // 包 Field)使 `group-data-[editable]/cell:hover:` selector 命中失敗 → 整個 hover
        // ring 在 autoRowHeight wrap text 場景失蹤。Edit mode focus ring 維持 Field DOM
        // border canonical(L3 state machine),hover 跟 focus 雖不同 DOM 但都在 column-edge
        // - 1px 同位置(數學等價,1px outline-offset:-1px 等同 1px border on cell-edge)。
        mode: 'display',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !px-0 !py-0 !gap-0 !h-full',
          'border border-transparent',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      {
        mode: 'readonly',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !px-0 !py-0 !gap-0 !h-full',
          'border border-transparent',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      {
        mode: 'disabled',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none cursor-not-allowed opacity-disabled !px-0 !py-0 !gap-0 !h-full',
          'border border-transparent',
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

// ── Naked Variant Cell Row-Mode Alignment Propagation ──────────────────────
// SSOT canonical(M19 / 2026-05-05):cell-as-input naked variant 元件**所有內部
// wrapper**(`<span>` 包 Avatar+name 等)必 import + apply 此 SSOT,host cell
// `data-row-mode` 屬性自動 propagate alignment(autoRow → items-start / fixed → items-center)。
//
// 不 propagate 的後果:autoRow 場景下 People / Select / Combobox 內部用
// `inline-flex items-center` hardcode → 視覺垂直置中於 wrapper 自身高度,**沒**頂對齊
// → 跟其他純文字 cell baseline 視覺漂移。
//
// 世界級對照:
//   - HTML <td> default `vertical-align: baseline`(瀏覽器自動 first-baseline align)
//   - AG Grid `cellStyle` + `cellRendererSelector`,row context 共享(closed source 部分)
//   - Material X-Grid `gridClasses.cell` wrapper 不允許 cell content override alignment
//   - Notion / Airtable cell content 從 host 繼承,不 hardcode self alignment
//
// Hook:`check_naked_row_mode_propagation.sh`(write-time BLOCKER)
// Audit:design-system-audit Group N M27(periodic batch verify)
export const nakedCellRowModeAlign = 'group-data-[row-mode=auto]/cell:items-start'

// ── Cell-as-input Display Hover Ring(2026-05-05 v9 — sole remaining ring const)─
// editable cell **display mode hover 提示**(「這 cell 可編,點 → 進 edit」affordance 信號)。
// 對齊 Notion / Airtable hover-cell-shows-border canonical。
//
// **為何只剩這一個**:Field naked **edit/focus/open state ring 已下沉到 Field default state
// machine**(border-based,2026-05-05 v9 architectural rewrite),不需 outline 平行系統;
// 但 display mode 沒 Field state(display = 純展示無互動),hover 提示需 cell wrapper 自加。
//
// **2026-05-07 v15.12 revert v15.10 SSOT 嘗試**:v15.10 試把 hover ring 搬到 Field DOM
// 用 `group-data-[editable]/cell:hover:border-border-hover` 統一 SSOT,但 wrap text 路徑
// (`<span break-words>` 包 Field)Tailwind selector 命中失敗 → hover ring 完全失蹤
// (Playwright 截圖驗證確認)。Revert 回 cell wrapper outline 機制 — 雖然 hover/focus 不同
// DOM 不同 CSS 屬性,但**數學等價**:outline-offset:-1px outline-1 = border-1 at cell-edge
// 都在 column-edge - 1px 同位置;Edit mode focus ring 仍掛 Field DOM(L3 state machine 不變)。
//
// 1px outline straddle cell edge:offset:[-1px] 起點,outline-1 1px 厚 → 完全 inside element
// edge,不破 row layout。Color `--border-hover` 對齊 Field default hover state token。
export const nakedCellEditableDisplayHover = 'hover:outline hover:outline-1 hover:outline-offset-[-1px] hover:outline-[var(--border-hover)]'

// ── Cell-as-input Edge Slot SSOT(2026-05-05 v8 — retire 平行 SSOT,改 L1 消費)───
//
// 前身 `nakedCellPrefixSlot` / `nakedCellSuffixSlot` 是 M1+M17 違反:平行 SSOT 跟
// `patterns/element-anatomy` 的 `<ItemPrefix>` / `<ItemSuffix>` primitive 撞 home。
// 已 retire — Field naked variant 內 prefix / suffix slot 直接消費 L1 primitive:
//
//   import { ItemPrefix, ItemSuffix } from '@/design-system/patterns/element-anatomy/item-anatomy'
//   <ItemPrefix><StartIcon /></ItemPrefix>     // 對 Input.startIcon / Select.startIcon
//   <ItemSuffix>{chevron}</ItemSuffix>          // 對 Combobox / DatePicker / PeoplePicker chevron
//
// **`h-[1lh]` 普世正確**(item-anatomy.spec.md:190-191 verbatim):
//   - 單行 wrapper items-center → slot 1lh 在 cell 高度中心 = 第一行中線(視覺 = items-center)
//   - 多行 wrapper items-start  → slot 1lh 鎖頂 = 第一行中線
//   不需 conditional `group-data-[row-mode=auto]/cell:` — 我前 v4 自加的 conditional 是過度設計。
//
// State ring 3 const 仍留(下方)— 是 Field naked 專屬,MenuItem / TreeView 用 bg hover 不用 outline。
// `nakedCellRowModeAlign`(wrapper 級)仍留 — 是 cell-context row-mode → wrapper alignment 適配,正交 slot 級。

// ── Empty Value Display ─────────────────────────────────────────────────────

export const EMPTY_DISPLAY = '—'
