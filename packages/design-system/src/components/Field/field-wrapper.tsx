// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { cva } from 'class-variance-authority'

// ── Field Wrapper Styles ────────────────────────────────────────────────────
// 所有 Field 元件共用的 input wrapper 樣式。
//
// 4 種模式(2026-05-05 expand):
//   edit     — bg-surface, border, hover/focus 回饋(可編輯 input)
//   display  — 純展示(無 input chrome、無 affordance);語意「read-only 內容,展示給人看」。
//              對齊 Carbon read-only / PatternFly inline-edit hidden-input。
//   readonly — bg-readonly(neutral-2), 無邊框, 文字正常色(input chrome 但鎖定;token 獨立於 disabled)
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
    // 2026-05-15 H1 root cause fix(user #1 verbatim 拍板「照你跟codex有共識的最佳建議做」+ codex round 1 verify cite 5/5):
    // 加 `min-w-0` 於 base — Field wrapper 為 cell-as-input substrate(DataTable / Form 上下文),
    // parent grid/flex cell 限寬時 wrapper 子 flex children 需 min-w-0 才能縮 + truncate。
    // 之前 SSOT 缺 → `selectedItemRenderer` / value text / Multi tag area 在 narrow cell 無法
    // truncate-with-ellipsis(`Alexander Hamilton Zhang` 直接被 cell overflow-hidden 硬裁無 `...`
    // 甚至蓋住相鄰 cell `—` indicator,圖二 user round 2 直接抓 trigger 越界證據)。
    // 修一處全 Field family 跟動(Input/Select/Combobox/DatePicker/TimePicker/LinkInput/
    // Textarea/NumberInput/PeoplePicker)— 對齊 M17/M19/M23 一處 SSOT + data-table.spec.md:233
    // 「禁硬裁無 ellipsis」DS canonical + MUI X DataGrid / Ant Table column.ellipsis 共識。
    'inline-flex items-center w-full min-w-0 rounded-md',
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
        // 2026-05-13 Q3 Path Ⅰ(user 拍板 Path Ⅰ 全 zero chrome + codex V2 verdict + field-controls.spec.md (d)):
        // default display = zero chrome — !px-0 !py-0 override size token 的 px-3,跟 Select / Combobox
        // / DatePicker / TimePicker / LinkInput non-D-path bare-span idiom 一致(Carbon read-only / Stripe
        // display / Notion property / Polaris readonly TextField 全 zero chrome)。
        className: 'bg-transparent border border-transparent !px-0 !py-0',
      },
      {
        mode: 'readonly',
        variant: 'default',
        className: 'bg-readonly border border-transparent',
      },
      {
        // 2026-05-13 R3.5(per codex Q3 verdict + user 拍「想盡辦法 auto-handle prereq」):
        // 移除 `opacity-disabled` blanket — Avatar 已 fieldCtx-aware self-dim(avatar.tsx self-managed
        // via `isDisabledInField` derivation)。Field wrapper 不再 host-control Avatar opacity。
        // Inner content(text-fg-disabled / Avatar self-opacity)走具體 disabled token per color.spec.md:729。
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
        // 2026-05-13 R3.5:移除 `opacity-disabled` blanket(per Avatar self-dim canonical)
        mode: 'disabled',
        variant: 'bare',
        className: 'bg-transparent border border-transparent cursor-not-allowed',
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
      // Phase 9 Issue 5 fix(2026-05-10 user 撞 + codex 重比稿 verdict ADOPT):
      //   Field naked variant 之前全寫 `!gap-0` strip Field family slot gap → indicator(chevron /
      //   calendar / clock)緊連 value 沒間距。違反 item-anatomy slot SSOT。
      //   Codex verdict:「naked 把 chrome stripping 跟 slot anatomy stripping 混在一起。
      //   chrome stripping 合理(去 padding / border / rounded);slot anatomy stripping 不合理
      //   (prefix / content / suffix gap 仍是 item anatomy slot canonical `gap-2`)」
      //   Fix:移除 `!gap-0`,讓 Field family base `gap-2`(field-wrapper.tsx:50)透出來。
      //   Cite:item-anatomy.spec.md L46-50 / L113-122 partial consumer canonical;
      //   field-controls.spec.md L22 Field Controls 視覺對齊 Family 1 Menu item layout。
      //   特殊 stack / multi-pill 場景若需 zero-gap,該 component spec 明文例外,不全域 strip。
      {
        mode: 'edit',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !h-full',
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
        // 2026-05-12 fix v2(M32 root invariant audit):
        //   Q1 root invariant?:cell-as-input display 視覺位置 = `cell.items-{X}` × `Field.height`
        //                       兩變數函數;canonical = autoRow → Field intrinsic + cell.items-start
        //                       (text 在 cell top + cellPadding-y),fixed → Field h-field-md +
        //                       cell.items-center(text 在 cell vertical center)。
        //   Q2 symptom?:`h-field-md` 32px 在 autoRow tall cell + cell items-start → Field 32px
        //              sitting at top,inside items-center default → text center = top+15 ≠ top。
        //              即使 `group-data-[row-mode=auto]/cell:!items-start` 加進來,Field height
        //              還是 32 → text 在 Field 內 top,但 Field 自己 height ≠ 0,offset 13~32px。
        //   Q3 fix layer?:root-layer fix = Field 在 autoRow context 必 `h-auto` 才能讓 text 真正
        //                  flush 到 cell.top + padding。前 v1 只 remove `!h-full` 是 surface-fix
        //                  (沒解決 h-field-md 32px persistence)。v2 真根因 fix:加 `!h-auto`
        //                  override h-field-md → Field intrinsic line-height → cell items-start
        //                  真實 anchor text at cell.top + padding。
        // Edit mode 不動(`!h-full` 保留 — border 必滿格對齊 cell border)。
        mode: 'display',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !px-0 !py-0 !h-auto',
          'border border-transparent',
        ],
      },
      {
        mode: 'readonly',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !px-0 !py-0 !h-auto',
          'border border-transparent',
        ],
      },
      {
        // 2026-05-13 Q3 fix(per codex Q3 verdict + color.spec.md:729 逃生艙 rule):
        // 移除 `opacity-disabled` blanket — naked wrapper 只負責 substrate(透明 border + 抑制 cursor),
        // 內部 content(text / icon / avatar)各自 disabled context 處理(text-fg-disabled / Avatar opacity 等具體 token)。
        // 對齊 DataTable cell-disabled TD 加 `bg-disabled` 表達 cell-level disabled state 的 SSOT 分權。
        // **default/bare disabled variant(line 107, 135)deferred R3.5** — 仍依賴 wrapper opacity-disabled
        // for Avatar dim(Avatar 尚未 fieldCtx-aware self-dim);Avatar self-dim 實作後再連帶移除。
        mode: 'disabled',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none cursor-not-allowed !px-0 !py-0 !h-auto',
          'border border-transparent',
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
  // 2026-05-15 Q1 真 root cause fix(per codex Round 4 cite-based verdict):
  // 加 `truncate` — 原 bareInputStyles 含 `flex-1 min-w-0` 但無 `truncate / text-overflow` policy。
  // 當 Select `searchable && open` 切 raw `<input placeholder=...>` branch(select.tsx:178),
  // bareInputStyles 套上,placeholder 無 ellipsis → narrow cell(<160px)硬裁無 `...`(user round 3
  // 圖一證據)。加 truncate 後 `<input>` `text-overflow: ellipsis` 啟動,符合 user 「placeholder 直接被截掉沒有變...」
  // 該顯 ellipsis 的 SSOT。對齊 data-table.spec.md:233「禁硬裁無 ellipsis」+ field-controls.spec.md:286
  // 共享 contract(a)「display/readonly/disabled/edit 4 mode 共享同一 renderer」semantic 對齊。
  'flex-1 min-w-0 truncate bg-transparent',
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
// **2026-05-09 v15.17 revert v15.16(user 未同意 ship)— 維持 v15.13 outline+offset:-1**
//
// User 2026-05-09 後續 message:「設計決策的東西你應該要先問過我讓我決策吧?為什麼就直接開跑」
// 我 commit 698ff58 ship v15.16(box-shadow inset Spec 2 不蓋 grid)= 設計決策結論未 user 同意
// 直接 ship = workflow 違反。Revert 回 v15.13 outline+offset:-1(原 user-accepted 路徑),
// 等 user 拍板 4-邊覆蓋路徑才 ship。
//
// User 並指出我視覺分析又錯:「我就是只有看到只有右邊被蓋掉,上面下面左邊都會露出 cell 的邊框」
// 我之前錯說「right + bottom 都覆蓋」,bottom 真實 row border-b 在 cell.outer 外 1px,outline 蓋不到。
//
// 真實 4-邊狀態(re-verified):
//   - right: outline 199-200 = cell own border-r 199-200 → 蓋 1 條線 ✓
//   - top: outline 0-1,前一 row border-b 在 cell.outer 外 → 露 2 條線
//   - bottom: outline 38-39 在 cell 內,row border-b 在 row.outer 內 = cell.outer 外 1px → 露 2 條線
//   - left: outline 0-1,前一 cell border-r 在 cell.outer 外 → 露 2 條線
//
// User 想要 4 邊都覆蓋 = 等 codex unframed brief + user 拍板,本次不 ship。
//
// 之前 v15.13 / 14 / 16 / 17 緣由 → tsc comment 之前版本 + planning RFC
// (跑錯方向 4 次 = 沒 1 次 verify 全面向 + 沒 user 拍板 set design)。
//
// Color `--border-hover` 對齊 Field default hover state token。
//
// **2026-05-10 Slice D Step 2 — Cell host CSS variable suppression**:
// outline color 改用 `var(--cell-hover-outline-color, var(--border-hover))`,
// allow DataTable cell host(spreadsheet overlay enabled 時)set `--cell-hover-outline-color: transparent`
// 抑制 outline,讓 overlay layer 接管 hover ring paint(per RFC Contract 8 「one geometry owner, two paint owners」)。
// Backward-compat:flag 關時 default `--border-hover`,既有行為不變。
export const nakedCellEditableDisplayHover = 'hover:outline hover:outline-1 hover:outline-offset-[-1px] hover:outline-[var(--cell-hover-outline-color,var(--border-hover))]'

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

/**
 * 2026-05-14 I2 fix(per field-controls.spec.md contract (e) display typography canonical):
 * Field family display path bare-span helper — `sm/md → text-body` / `lg → text-body-lg`,
 * 跨 9 元件 display 視覺尺寸統一(user 抓 LinkInput 字體跟其他 Field 不一致 = SSOT 違反)。
 * Consumer:LinkInput / Select / Combobox / DatePicker / TimePicker non-D-path bare-span 套此 class。
 */
export const fieldDisplayTextClass = (size: 'sm' | 'md' | 'lg'): string =>
  size === 'lg' ? 'text-body-lg' : 'text-body'
