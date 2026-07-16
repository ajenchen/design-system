// @internal — DS-internal 單元(Field 家族 chrome 基底,consumer 用 Field/Input 等 wrapper 不直用);不隨 index.ts re-export 進 npm public surface。
// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ── Field Wrapper Styles ────────────────────────────────────────────────────
// 所有 Field 元件共用的 input wrapper 樣式。
//
// 4 種模式(2026-05-05 expand;2026-07-16 round16 `display`→`view` 更名 + Model A):
//   edit     — bg-surface, border, hover/focus 回饋(可編輯 input)
//   view     — 純展示值(非表單);**Model A = edit 幾何減 chrome**(透明 bg/border,**保留 px 內距 + 高度**),
//              故 read↔edit 零跳。對齊 Atlassian inline-edit(read=edit 幾何)+ Bootstrap plaintext(留 padding)。
//   readonly — bg-readonly(neutral-2), 無邊框, 文字正常色(input chrome 但鎖定;token 獨立於 disabled)
//   disabled — bg-disabled(neutral-2), 無邊框, 文字灰化
//
// 2 種視覺外殼(variant;2026-07-09 `bare` 退役後):
//   default — 完整 chrome(form input 場景);view×default = edit 幾何減 chrome(留 px/py)
//   naked   — cell-as-input substrate(DataTable);**edit×naked 自畫 border-based state machine**
//              (border-border → hover:border-border-hover → focus-within:border-primary → error 紅框);
//              view×naked = bare(host TD 給 padding)。**view×default ≠ view×naked**(不 collapse)。
//              (2026-07-16 cell disabled 態廢除 → readonly×naked/disabled×naked 死格已移除)
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
    // 2026-07-08 width 軸:`w-full` 從 base 移入 `width` variant(fill = 原行為 default,
    // 零回歸;hug = w-fit 依內容收縮)。詳 field-controls.spec.md「寬度軸(width: fill / hug)」。
    'inline-flex items-center min-w-0 rounded-md',
    'text-foreground font-normal',
    'transition-colors duration-150',
  ],
  {
    variants: {
      mode: {
        edit: '',
        view: '',
        readonly: '',
        disabled: '',
      },
      variant: {
        // default — 完整 Field wrapper chrome(bg-surface、明顯 border、hover/focus 回饋)
        default: '',
        // naked — cell-as-input(Notion / Airtable / Excel canonical)。**edit×naked 自畫** border +
        // hover:border-border-hover + focus-within:border-primary + error 紅框(v14 border-based state
        // machine,見下方 compoundVariants L182-196);display/readonly/disabled×naked 用 transparent
        // border 由 host cell 提供視覺邊框,內部 input 純文字承載。
        // 世界級對照:Airtable / Notion / Excel / Google Sheets cell editing。
        // (2026-07-09 `bare` variant 已退役 — 見 field-types.ts FieldVariant 註解;
        //  被 import 的 `bareInputStyles` 常數是內層 input 重置樣式、與此不同物、保留。)
        naked: '',
      },
      size: {
        sm: 'text-body h-field-sm px-[var(--field-px)] gap-2',
        md: 'text-body h-field-md px-[var(--field-px)] gap-2',
        lg: 'text-body-lg h-field-lg px-[var(--field-px)] gap-2',
      },
      // width(2026-07-08 user 拍板,正交軸):寬度軸 — 只改寬度,chrome / hover / focus /
      // error / mode compoundVariants 全部不動(user verbatim「框線和互動和樣式都不變,
      // 只有寬度有變而已 … 把 field 和 value 的寬度都改成 hug」)。
      //   fill(default)— `w-full` 填滿容器 = 與移軸前 base 完全等價(零回歸不變量)
      //   hug — `w-fit` 依內容收縮:value 寬 + 各 slot 元素寬 + gap + field 內 padding;
      //         `max-w-full` 保證窄容器不溢出(min-w-0 保留,仍可 truncate)
      // Benchmark(M22):shadcn v4 SelectTrigger 預設 `w-fit`
      //   https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/select.tsx
      //   Radix Select Trigger intrinsic sizing https://www.radix-ui.com/primitives/docs/components/select
      width: {
        fill: 'w-full',
        hug: 'w-fit max-w-full',
      },
      // error(2026-07-04 Q1 拍板,SSOT 集中):原散在各控件的 error border classes 因
      // focus-within:!border-primary(!important)被蓋 = dead code(聚焦永遠藍)。
      // Benchmark 實查證偽舊宣稱:MUI(紅框加粗)/ Ant(紅框紅 glow)/ Polaris(紅 border
      // + 獨立藍 focus ring)聚焦時 error 紅皆保留;唯一切藍的 Carbon 靠 in-field 紅 icon 補償。
      // DS 邊框是唯一 error 載體 → error 勝 focus 的「顏色」通道。錯誤清除(edit-clears-error,
      // useFormValidation)後自然回 focus 藍。
      error: {
        true: '',
        false: '',
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
          //
          // 2026-07-04 Q1 拍板修訂:「focus dominates everything」對 error 讓位(見 error variant
          // 註解)— focus 藍只在 error:false compound(下方),error:true 走 error compound 紅。
          'data-[state=open]:border-border-hover',
        ],
      },
      { mode: 'edit', variant: 'default', error: false, className: 'focus-within:!border-primary focus-within:hover:!border-primary' },
      {
        // 2026-07-16 round16 Model A(user GO,推翻 2026-05-13 Path Ⅰ 的 `!px-0 !py-0`):
        // view×default = **edit 幾何減 chrome** — 保留 size 軸的 `px-[var(--field-px)]` + `h-field-*`,
        // 只拔 border/bg(透明)。理由 = view 用在 cell/inline-edit/詳情,要對齊的是「edit 的值位置」
        // (非 label 左緣),故水平垂直都留 → view 與 edit 同一顆控件、只差 chrome → read↔edit 零跳。
        // 世界級對照:Atlassian inline-edit(read=edit 幾何,靠容器負邊距對齊)+ Bootstrap
        // `.form-control-plaintext`(`padding: $input-padding-y 0` 留 padding);我們比 Bootstrap 更徹底
        // (連水平 px 也留),因用例是 align-to-edit 非 align-to-label。詳 field-controls.spec.md「軸一 view mode」
        // + planning/2026-07-15-inline-edit-field-mode-remediation.md round16。
        // ⚠️ view×default ≠ view×naked:naked = bare(cell substrate,host TD 給 padding);default = 留幾何。
        mode: 'view',
        variant: 'default',
        className: 'bg-transparent border border-transparent',
      },
      {
        mode: 'readonly',
        variant: 'default',
        // 2026-07-09 A11y fix(WCAG 2.4.7 Focus Visible):readonly **有值** 渲染 native `<input readOnly>`
        // = 可 Tab 聚焦、可選取/複製,但原 compound 無任何 focus 指示 → 鍵盤使用者聚焦不可見 = 違反。
        // 補 focus ring 採 **ring idiom**(`ring-2 ring-ring ring-offset-1`,與 Button/Checkbox/Tabs/
        // Switch 同一套 focus-visible canonical;`--ring == --primary` semantic.css:334)而非 edit mode
        // 的 `border-primary` idiom —— readonly 邊框 transparent 無可染;且 ring 語義 = 「可聚焦但非文字
        // 輸入」(對齊 button/tab/checkbox 這類 focusable-非-text-entry 控件的視覺語言)。
        // `:has(:focus-visible)`:readonly 渲 native `<input readOnly>`。⚠️ 瀏覽器對 text-entry 控件的
        // :focus-visible 啟發式在滑鼠點擊時**亦 match**(text input 恆視為 focus-visible,對齊
        // field-controls.spec.md「Focus 行為」段『文字輸入永遠 focus-visible、CSS 無法區分點擊與 Tab』),
        // 故點擊 readonly input 也會顯 ring,勿宣稱僅鍵盤觸發(button 的 focus-visible 才滑鼠不觸發,
        // input 不同;真要滑鼠抑制需 JS 追蹤 input modality,屬 API 擴充)。
        className: 'bg-readonly border border-transparent [&:has(:focus-visible)]:ring-2 [&:has(:focus-visible)]:ring-ring [&:has(:focus-visible)]:ring-offset-1',
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
      // (2026-07-09 `bare` variant 退役:原 edit×bare / edit×bare×error compounds 已移除。)
      // error chrome(mode=edit 限定,variant 不分 — naked cell 內 error 同樣紅框,保留既有控件層行為):
      {
        mode: 'edit',
        error: true,
        className: 'border-error hover:border-error-hover focus-within:!border-error focus-within:hover:!border-error',
      },
      // (2026-07-09 `bare` variant 退役:原 display×bare / readonly×bare / disabled×bare compounds 已移除。)
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
          // v13.3 SSOT canonical:focus-within !important(同 default + bare;
          // 2026-07-04 Q1:focus 藍移到 error:false compound,error:true 走共用 error compound)
          'data-[state=open]:border-border-hover',
          'group-data-[row-mode=auto]/cell:!items-start',
        ],
      },
      { mode: 'edit', variant: 'naked', error: false, className: 'focus-within:!border-primary focus-within:hover:!border-primary' },
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
        // 2026-07-16 round16:view×naked 保持 bare(cell substrate,host TD 給 padding)— 與 view×default
        // (edit 幾何減 chrome、留 px/py)本質不同用途,**不 collapse**(round14 合併是錯的)。
        mode: 'view',
        variant: 'naked',
        className: [
          'bg-transparent !rounded-none !px-0 !py-0 !h-auto',
          'border border-transparent',
        ],
      },
      // 2026-07-16 round16:`readonly×naked` / `disabled×naked` 死格移除 —— DataTable cell 廢除
      //   disabled 態(view 一律 mode="view";displayOrDisabled helper 已刪)+ readonly 從不入 naked
      //   路徑(全庫 0 消費)。軸對稱靠 cva 省略即天然覆蓋(base+size+透明),不需 dead compound 佔位。
    ],
    defaultVariants: {
      mode: 'edit',
      variant: 'default',
      size: 'md',
      width: 'fill',
      error: false,
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
// Hook:`check_field_family_invariants.sh` A.1(原 check_naked_row_mode_propagation.sh 已 folded,write-time BLOCKER)
// Audit:design-system-audit Group N(periodic batch verify)
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
// State ring 唯一 const `nakedCellEditableDisplayHover` 仍留(下方 L332,見其自述「sole remaining ring const」)— 是 Field naked 專屬,MenuItem / TreeView 用 bg hover 不用 outline。
// `nakedCellRowModeAlign`(wrapper 級)仍留 — 是 cell-context row-mode → wrapper alignment 適配,正交 slot 級。

// ── Empty Value Display ─────────────────────────────────────────────────────

// 2026-07-08 user 拍板(verbatim「我從頭到尾哪裡有說要用全形的」):空值符號 = **半形 hyphen
// `-`(U+002D)**，非全形 em dash `—`(U+2014)。不可編輯(readonly / standalone display /
// table 不可編輯 cell)空值一律此符號 + `text-fg-muted`。分流邏輯 SSOT = field-context.ts
// `useFieldEmptyDisplay()`(table-cell 可編輯 → 空白；其餘 → 本常數)。
// 世界級對照:Ant ProTable `columnEmptyText` 預設 `'-'`(U+002D 半形)
//   https://github.com/ant-design/pro-components/blob/master/src/table/Table.tsx
export const EMPTY_DISPLAY = '-'

/**
 * 2026-05-14 I2 fix(per field-controls.spec.md contract (e) display typography canonical):
 * Field family display path bare-span helper — `sm/md → text-body` / `lg → text-body-lg`,
 * 跨 9 元件 display 視覺尺寸統一(user 抓 LinkInput 字體跟其他 Field 不一致 = SSOT 違反)。
 * Consumer:LinkInput / Select / Combobox / DatePicker / TimePicker non-D-path bare-span 套此 class。
 */
export const fieldDisplayTextClass = (size: 'sm' | 'md' | 'lg'): string =>
  size === 'lg' ? 'text-body-lg' : 'text-body'

/**
 * 2026-07-16 round16 Model A(user GO):Field view mode 幾何 SSOT(= view×default compound 的
 * 幾何部分,抽成 class helper 供 **InlineEdit 純值/標題路徑** 消費,避免 InlineEdit 自帶重複的
 * geometry cva〔M17 消重〕)。
 *
 * 回傳「edit 幾何減 chrome」的排版盒:
 *   - 水平:`px-[var(--field-px)]`(= edit 內距,靠 InlineEdit `-mx` 拉回欄左緣後,值落 edit 值位置)
 *   - 單行:`min-h-[var(--field-height-N)]` N∈{sm,md,lg} + `items-center`(垂直置中於 field 高度,= edit 單行)
 *   - 多行:`items-start` + `py-2`(頂對齊 + 上下內距,**= Textarea edit `py-2`**,textarea.tsx base;
 *     read↔edit 零跳)。⚠️ py-2 與 Textarea 同值 = SSOT 契約,`scripts/inline-edit-view-geometry-invariant.mjs`
 *     機械鎖(Textarea py 一改即紅)。
 *
 * 值-格式化路徑(Select→Tag / Date / avatar)**不用**此 helper —— 直接委派 `<Control mode="view">`,
 * 幾何 + 內部間距皆由控件 view×default 提供(read=edit 同一顆 → 天生一致)。
 */
export const fieldViewGeometry = (size: 'sm' | 'md' | 'lg', multiline?: boolean): string =>
  cn(
    'flex w-full min-w-0 px-[var(--field-px)]',
    size === 'sm' && 'min-h-[var(--field-height-sm)]',
    size === 'md' && 'min-h-[var(--field-height-md)]',
    size === 'lg' && 'min-h-[var(--field-height-lg)]',
    multiline ? 'items-start py-2' : 'items-center',
  )
