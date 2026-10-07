// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite(Button + iconOnly + danger + loading + asChild + dismiss + pressedTone)— 跨 7 axis variant 集中 SSOT 一處,拆分會 fragment cva variant catalog。當前 528 < cap 800。
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useResolvedFieldSize } from '@/design-system/components/Field/field-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

/**
 * Button — shadcn 風格，橋接設計系統 token
 *
 * ── Variants ──
 *   primary    主要操作，藍底白字
 *   secondary  次要品牌操作，藍框藍字；正面 vs 負面並存時用於正面那個
 *   tertiary   一般輔助操作，灰框灰字，hover 轉藍（最常用的非主要按鈕）
 *   text       無底色無邊框，hover 顯示灰底（工具列、密集 UI）
 *   link       外觀像連結的按鈕（本質仍是 button）
 *
 * ── danger prop ──
 *   danger     套用危險色（紅色）；僅 primary / secondary / text 支援（tertiary / link 不支援，見 spec 禁止事項）
 *
 *   <Button variant="primary" danger>永久刪除</Button>        → 紅底白字（立即不可逆）
 *   <Button variant="secondary" danger>移至垃圾桶</Button>    → 紅框紅字（點下去還可反悔）
 *
 * ── pressed prop（toggle）──
 *   pressed    Toggle 按下狀態（持續 on/off），寫入 aria-pressed + data-state
 *   僅 secondary / tertiary / text 三個 variant 支援 toggle 視覺：
 *     - secondary + pressed → primary-subtle 底、primary 字、透明邊框
 *     - tertiary  + pressed → primary-subtle 底、primary 字、透明邊框（同 secondary 按下視覺）
 *     - text      + pressed → primary-subtle 底、primary 字、透明邊框（預設 pressedTone='emphasis'，同 secondary/tertiary 按下視覺）；pressedTone='neutral' 時才走 neutral-selected 灰底
 *   primary / link 傳入 pressed 無視覺效果（語意不符）
 *
 * ── Sizes（預設 md）──
 *   xs   h-field-xs（24px 固定），不隨 density 縮放
 *   sm   h-field-sm，md=28px / lg=32px
 *   md   h-field-md，md=32px / lg=36px  ← 預設（跟 Field/Input 對齊）
 *   lg   h-field-lg，md=36px / lg=40px
 *   icon-only 不是獨立尺寸 — 加 iconOnly prop 讓任何尺寸變正方形
 *
 * ── 內部結構 ──
 *   [startIcon?]  [label]  [badge? + endIcon?]
 *
 * ── 用法範例 ──
 *   <Button startIcon={Plus}>新增</Button>
 *   <Button variant="tertiary">取消</Button>
 *   <Button variant="primary" danger>永久刪除</Button>
 *   <Button variant="text" pressed={isPinned} startIcon={Pin} aria-label="釘選" iconOnly />
 *   <Button badge={<Badge count={3} />} endIcon={ChevronDown}>通知</Button>
 *   <Button size="sm" iconOnly startIcon={Plus} aria-label="新增" />
 *   <Button iconOnly startIcon={Bell} aria-label="通知 (3 則)"
 *           overlayBadge={<Badge count={3} />} />  ← badge 自動貼 icon 右上角
 *
 * ── asChild ──
 *   <Button asChild><Link to="/home">回首頁</Link></Button>
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'whitespace-nowrap font-medium',
    'border border-transparent',
    // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
    'cursor-pointer select-none disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
    // 2026-05-12 Round 4.5 fix(codex M31 Layer C 抓):`aria-disabled` visual 分支補(per WAI-ARIA APG —
    // aria-disabled 給語意 + visual,但不 suppress functionality;functionality 由 consumer 阻 e.g.
    // RowDragHandle listeners 只在 canDrag spread)。**故意不加** `aria-disabled:pointer-events-none`
    // — Round 4 RowDragHandle Tooltip flicker fix root cause:aria-disabled buttons 必保 pointer events
    // 讓 Radix Tooltip pointerenter 通過。
    // 2026-09-29(待辦總帳 N46 停用游標全站掃):原生 `disabled` 原本也掛 `pointer-events-none`(「完全 inactive」),
    // 結果上面那句 `disabled:cursor-not-allowed` 從來沒生效 —— 沒有指標事件就沒有游標,全站 35 顆停用的 Button 家族
    //(分頁箭頭 / 輪播箭頭 / AI 面板送出鈕)都是箭頭游標,違反 hit-area-canonical.md「停用的用禁止符號」。
    // 現在停用不再切掉指標事件;滑過 / 按住的回饋改由各 variant 的 `disabled:hover:` / `disabled:active:` 顯式釘在停用靜止值
    //(同 aria-disabled 的寫法;原生 disabled 的按鈕本來就不派發 click)。
    // 2026-05-12 fix v2(playwright pixel-quantified verify 抓 opacity=1 不生效):
    // `opacity-disabled` 是 custom Tailwind v4 `@utility`(opacity.css:21),variant prefix
    // `aria-disabled:` 跟 custom @utility 不 compose(`aria-disabled:cursor-not-allowed` 標準
    // utility 能 work,custom 不行)。改 arbitrary value `opacity-[var(--opacity-disabled)]`
    // 繞 custom @utility 限制(Tailwind v4 arbitrary value 直接生 `opacity: var(--opacity-disabled)`)。
    'aria-disabled:opacity-[var(--opacity-disabled)]',
    'rounded-md',
    // Defensive:SVG 不被 flex shrink 擠扁(防 inner-area 計算誤差導致 icon 被擠成
    // width<intrinsic 的 asymmetric 顯示)。詳 ICON_ONLY_PX 段 rationale。
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-on-emphasis',
          'hover:bg-primary-hover',
          'active:bg-primary-active',
          // 開啟中 = 自己的 hover(inline-action.spec.md:26「overlay 開啟 → 同 host hover」)。2026-09-29 待辦總帳 C13:
          // 七家一手裡沒有任何一家「給部分 variant、獨獨豁免 primary」(Atlassian / Fluent 每個 appearance 含 primary 都給;
          // Radix / shadcn / MUI / Ant / Carbon 全都不給);DS 早選了「給」,primary / link 缺的只是同一條規則的落地。
          'data-[state=open]:bg-primary-hover',
          // aria-disabled 的 hover / active 釘在靜止(button.spec.md「狀態疊加」表 aria-disabled 列:與 disabled 同樣不給互動回饋;
          // 原生 disabled 與 aria-disabled 都顯式釘住(2026-09-29 前原生 disabled 靠 pointer-events-none,見檔頭);先例 switch.tsx 的 `disabled:…:hover:` 守衛)
          'aria-disabled:hover:bg-primary aria-disabled:active:bg-primary',
          'disabled:bg-disabled disabled:text-fg-disabled disabled:border-transparent',
          'disabled:hover:bg-disabled disabled:active:bg-disabled',
        ],
        secondary: [
          'bg-surface text-primary border-primary',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          // Overlay trigger active(asChild Popover/DropdownMenu trigger)— 維持 hover 樣式
          // (canonical 對齊 inline-action.spec.md:trigger 維持 host hover 直到 overlay 關閉)
          'data-[state=open]:text-primary-hover data-[state=open]:border-primary-hover',
          // aria-disabled 釘住(同 primary 註解);`not-aria-pressed` = 只釘「未按下」的靜止,按下的由 pressed compound 自己釘(避免兩組 (0,3,0) 靠產出順序決勝)
          'aria-disabled:not-aria-pressed:hover:text-primary aria-disabled:not-aria-pressed:hover:border-primary',
          'aria-disabled:not-aria-pressed:active:text-primary aria-disabled:not-aria-pressed:active:border-primary',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
          'disabled:hover:text-fg-disabled disabled:hover:border-border disabled:active:text-fg-disabled disabled:active:border-border',
          // 2026-05-21 v12:Toggle pressed 視覺移到 compoundVariants(variant × pressedTone),
          // 同時支援 emphasis(藍底)/ neutral(灰底)兩 tone。詳 cva.compoundVariants 段。
        ],
        tertiary: [
          'bg-surface text-foreground border-border',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          // Overlay trigger active — 維持 hover 樣式(同 secondary 邏輯)
          'data-[state=open]:text-primary-hover data-[state=open]:border-primary-hover',
          // aria-disabled 釘住(同 secondary 註解)
          'aria-disabled:not-aria-pressed:hover:text-foreground aria-disabled:not-aria-pressed:hover:border-border',
          'aria-disabled:not-aria-pressed:active:text-foreground aria-disabled:not-aria-pressed:active:border-border',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
          'disabled:hover:text-fg-disabled disabled:hover:border-border disabled:active:text-fg-disabled disabled:active:border-border',
        ],
        text: [
          'bg-transparent text-foreground border-transparent',
          'hover:bg-neutral-hover',
          'active:bg-neutral-active',
          // Overlay trigger active — 維持 hover 樣式(canonical 2026-05-02 改:hover token,
          // 不另開 selected 4% — 對齊 shadcn/Radix/Material 狀態極簡派,跨 host 一致)
          'data-[state=open]:bg-neutral-hover',
          // aria-disabled 釘住(同 secondary 註解)
          'aria-disabled:not-aria-pressed:hover:bg-transparent aria-disabled:not-aria-pressed:active:bg-transparent',
          'disabled:bg-transparent disabled:text-fg-disabled',
          'disabled:hover:bg-transparent disabled:hover:text-fg-disabled disabled:active:bg-transparent disabled:active:text-fg-disabled',
        ],
        link: [
          'bg-transparent text-primary border-transparent',
          'hover:text-primary-hover',
          'active:text-primary-active',
          // 開啟中 = 自己的 hover(link 的 hover 只換字色;同 primary 分支註解,2026-09-29 C13)
          'data-[state=open]:text-primary-hover',
          // aria-disabled 釘住(同 primary 註解;link 無 pressed 視覺,不需 not-aria-pressed)
          'aria-disabled:hover:text-primary aria-disabled:active:text-primary',
          'disabled:text-fg-disabled',
          'disabled:hover:text-fg-disabled disabled:active:text-fg-disabled',
        ],
      },
      danger: {
        true: '', // 實際樣式由 compoundVariants 提供
      },
      /**
       * 2026-05-21 v12 — pressed visual tone(per user「我認同這一個方向,然後預設emphasis」):
       * emphasis = 淡藍底(toolbar functional toggle / 篩選啟用 / 面板開關 — Figma toolbar /
       *            Linear toolbar / Material ToggleButton 共識)
       * neutral  = 灰底(**可取消**的切換鈕、要比藍底低一級時;不用於導覽 / 目前頁 —— 那是選中列,
       *            owner = item-anatomy.spec.md「選中 × 互動疊加」;button.spec.md pressedTone 表,待辦總帳 B5 2026-09-25 更正)
       * 預設 `emphasis` per user directive。實際樣式由 compoundVariants(variant × pressedTone)套用。
       * 只在 secondary / tertiary / text variant 觸發 toggle 視覺;primary / link 無視覺效果。
       */
      pressedTone: {
        emphasis: '',
        neutral: '',
      },
      size: {
        xs: 'h-field-xs px-2 text-caption leading-compact gap-0',
        sm: 'h-field-sm px-3 min-w-14 text-body leading-compact gap-1',
        md: 'h-field-md px-3 min-w-16 text-body leading-compact gap-1',
        lg: 'h-field-lg px-3 min-w-20 text-body-lg leading-compact gap-1',
      },
    },
    compoundVariants: [
      // primary + danger → 紅底白字（立即不可逆操作）
      {
        variant: 'primary',
        danger: true,
        class: [
          'bg-error text-on-emphasis border-transparent',
          'hover:bg-error-hover',
          'active:bg-error-active',
          // 開啟中 = 自己的 hover(同 primary 分支,2026-09-29 C13)
          'data-[state=open]:bg-error-hover',
          // aria-disabled 釘在自己的靜止紅(button.spec.md「狀態疊加」表 aria-disabled 列)
          'aria-disabled:hover:bg-error aria-disabled:active:bg-error',
        ],
      },
      // secondary + danger → 紅框紅字（有確認步驟的危險操作）
      {
        variant: 'secondary',
        danger: true,
        class: [
          'bg-surface text-error border-error',
          'hover:text-error-hover hover:border-error-hover',
          'active:text-error-active active:border-error-active',
          // 開啟中 = 自己的 hover(error-hover),不是 secondary 的 primary-hover(inline-action.spec.md「overlay 開啟 → 同 host hover」;
          // button.spec.md「狀態疊加」表開啟中列)。靠 cn()/twMerge 去掉 variant 那組同前綴 class,同本檔 danger 覆寫慣例
          'data-[state=open]:text-error-hover data-[state=open]:border-error-hover',
          'aria-disabled:not-aria-pressed:hover:text-error aria-disabled:not-aria-pressed:hover:border-error',
          'aria-disabled:not-aria-pressed:active:text-error aria-disabled:not-aria-pressed:active:border-error',
        ],
      },
      // text + danger → 紅字，hover 灰底
      {
        variant: 'text',
        danger: true,
        class: [
          'text-error',
          'hover:bg-neutral-hover hover:text-error-hover',
          'active:bg-neutral-active active:text-error-active',
          // 開啟中 = 自己的 hover 配對:底色沿用 text 的 data-[state=open]:bg-neutral-hover,字補上 error-hover(同 secondary+danger 註解)
          'data-[state=open]:text-error-hover',
          'aria-disabled:not-aria-pressed:hover:text-error aria-disabled:not-aria-pressed:active:text-error',
        ],
      },
      // ── 2026-05-21 v12 Toggle pressed(variant × pressedTone)──────────────────
      // 視覺由 data-[state=on] + aria-pressed(Radix overlay trigger fallback)觸發
      //
      // emphasis tone:藍底(primary-subtle / primary 字)— functional toggle
      {
        variant: ['secondary', 'tertiary', 'text'],
        pressedTone: 'emphasis',
        class: [
          'data-[state=on]:bg-primary-subtle data-[state=on]:text-primary data-[state=on]:border-transparent',
          // 按下的 hover / active 只換字(primary-hover / -active),底色與邊框顯式釘住 —— 照 sidebar.tsx
          // `data-[active=true]:hover:bg-neutral-selected` 寫法,釘住 (0,3,0) > variant 的 hover / active (0,2,0)。
          // 之前底色只是靠 CSS 產出順序(data-* 排在 hover 之後)才沒被 text 的 neutral-hover 換掉(button.spec.md「狀態疊加」表 pressed × hover / active 列)
          'data-[state=on]:hover:bg-primary-subtle data-[state=on]:hover:border-transparent data-[state=on]:hover:text-primary-hover',
          'data-[state=on]:active:bg-primary-subtle data-[state=on]:active:border-transparent data-[state=on]:active:text-primary-active',
          'data-[state=on]:disabled:bg-disabled data-[state=on]:disabled:text-fg-disabled data-[state=on]:disabled:border-transparent',
          'data-[state=on]:disabled:hover:bg-disabled data-[state=on]:disabled:hover:text-fg-disabled data-[state=on]:disabled:hover:border-transparent data-[state=on]:disabled:active:bg-disabled data-[state=on]:disabled:active:text-fg-disabled data-[state=on]:disabled:active:border-transparent',
          // aria-pressed fallback(Radix overlay trigger override data-state 時仍生效)—— 逐條鏡像上方 data-[state=on] 分支
          'aria-pressed:bg-primary-subtle aria-pressed:text-primary aria-pressed:border-transparent',
          'aria-pressed:hover:bg-primary-subtle aria-pressed:hover:border-transparent aria-pressed:hover:text-primary-hover',
          // 2026-07-07 補齊第三階:fallback 分支與 data-[state=on] 分支同拼寫(選中之上按壓 = active 階)
          'aria-pressed:active:bg-primary-subtle aria-pressed:active:border-transparent aria-pressed:active:text-primary-active',
          // pressed + disabled:disabled 視覺優先(button.spec.md「狀態 → disabled」pressed + disabled 條);fallback 分支原本缺這條,鏡像 data-[state=on]:disabled
          'aria-pressed:disabled:bg-disabled aria-pressed:disabled:text-fg-disabled aria-pressed:disabled:border-transparent',
          'aria-pressed:disabled:hover:bg-disabled aria-pressed:disabled:hover:text-fg-disabled aria-pressed:disabled:hover:border-transparent aria-pressed:disabled:active:bg-disabled aria-pressed:disabled:active:text-fg-disabled aria-pressed:disabled:active:border-transparent',
          // 按下的觸發鈕開啟中 = 按下自己的 hover(底色與邊框不動、字 primary-hover),不是 variant 的開啟樣式
          //(inline-action.spec.md「overlay 開啟 → 同 host hover」;button.spec.md「狀態疊加」表開啟中列)。
          // Radix 會把 data-state 改寫成 open,所以只走 aria-pressed;(0,3,0) > variant 的 data-[state=open] (0,2,0)
          'aria-pressed:data-[state=open]:bg-primary-subtle aria-pressed:data-[state=open]:border-transparent aria-pressed:data-[state=open]:text-primary-hover',
          // 按下 + aria-disabled:hover / active 釘在按下的靜止字色(底色與邊框已由上方釘住)
          'data-[state=on]:aria-disabled:hover:text-primary data-[state=on]:aria-disabled:active:text-primary',
          'aria-pressed:aria-disabled:hover:text-primary aria-pressed:aria-disabled:active:text-primary',
        ],
      },
      // neutral tone:灰底(neutral-selected family)— 可取消的切換鈕;導覽 / 目前頁不用它(選中列規則,item-anatomy.spec.md「選中 × 互動疊加」)
      // 階梯值 selected → -selected-hover → -selected-active(2→3→4):user 2026-09-25 選「甲：保留，維持 2→3→4 (Recommended)」
      // (選項由 AI 提供;待辦總帳 B5)。下方開啟中 / aria-disabled 各條都是「跟著本分支的 hover / 靜止 token 走」,改階梯時同一 compound 內一起改。
      // 2026-09-29(待辦總帳 N7):secondary 從這一組拆出去(下一組)—— 它的靜止底是 `--surface`(「底」),已按下要**疊層**不換底:
      // 深色 --surface 與 --neutral-selected 都是白 8%,換底後已按下 = 未按下(#1E1E1E = #1E1E1E);tertiary / text 是透明底,換底沒問題。
      {
        variant: ['tertiary', 'text'],
        pressedTone: 'neutral',
        class: [
          'data-[state=on]:bg-neutral-selected data-[state=on]:text-foreground data-[state=on]:border-transparent',
          // 字與邊框在 hover / active 顯式釘住(secondary / tertiary 的 hover 會把字與框轉 primary;同 emphasis 分支註解)
          'data-[state=on]:hover:bg-neutral-selected-hover data-[state=on]:hover:text-foreground data-[state=on]:hover:border-transparent',
          'data-[state=on]:active:bg-neutral-selected-active data-[state=on]:active:text-foreground data-[state=on]:active:border-transparent',
          'data-[state=on]:disabled:bg-transparent data-[state=on]:disabled:text-fg-disabled',
          'data-[state=on]:disabled:hover:bg-transparent data-[state=on]:disabled:hover:text-fg-disabled data-[state=on]:disabled:active:bg-transparent data-[state=on]:disabled:active:text-fg-disabled',
          // aria-pressed fallback —— 逐條鏡像上方 data-[state=on] 分支
          'aria-pressed:bg-neutral-selected aria-pressed:text-foreground aria-pressed:border-transparent',
          'aria-pressed:hover:bg-neutral-selected-hover aria-pressed:hover:text-foreground aria-pressed:hover:border-transparent',
          // 補齊第三階(按壓):fallback 原本缺,data-[state=on] 分支與 emphasis 分支都有(同 emphasis 2026-07-07 註解)
          'aria-pressed:active:bg-neutral-selected-active aria-pressed:active:text-foreground aria-pressed:active:border-transparent',
          'aria-pressed:disabled:bg-transparent aria-pressed:disabled:text-fg-disabled',
          'aria-pressed:disabled:hover:bg-transparent aria-pressed:disabled:hover:text-fg-disabled aria-pressed:disabled:active:bg-transparent aria-pressed:disabled:active:text-fg-disabled',
          // 按下的觸發鈕開啟中 = 按下自己的 hover(neutral-selected-hover),不是 variant 的 neutral-hover / primary-hover(同 emphasis 分支註解)
          'aria-pressed:data-[state=open]:bg-neutral-selected-hover aria-pressed:data-[state=open]:text-foreground aria-pressed:data-[state=open]:border-transparent',
          // 按下 + aria-disabled:hover / active 釘在按下的靜止底色
          'data-[state=on]:aria-disabled:hover:bg-neutral-selected data-[state=on]:aria-disabled:active:bg-neutral-selected',
          'aria-pressed:aria-disabled:hover:bg-neutral-selected aria-pressed:aria-disabled:active:bg-neutral-selected',
        ],
      },
      // secondary(白底)× neutral:底留 `bg-surface`,已按下三階用疊層 utility(semantic.css `bg-interaction-selected` 家族 =
      // 把 --neutral-selected / -hover / -active 畫成 background-image,在底色之上、內容之下;配對總則第 2 列「底不換,疊一層」)。
      // 淺色疊層結果與換底相同(#F5F5F5 / #F0F0F0 / #E8E8E8),深色才分得出來(#303030 / #37 / #3D)。逐條鏡像上一組;
      // 停用態拿掉疊層(`bg-none`)而不是把底換成透明 —— 白底鈕停用仍是白底。
      {
        variant: 'secondary',
        pressedTone: 'neutral',
        class: [
          // 底寫明 `bg-surface`(與 variant 相同,不換底):疊層是疊在「底」上,hover-own-pair 閘據此判定,不必去別的 compound 找靜止底
          'data-[state=on]:bg-surface data-[state=on]:bg-interaction-selected data-[state=on]:text-foreground data-[state=on]:border-transparent',
          'data-[state=on]:hover:bg-interaction-selected-hover data-[state=on]:hover:text-foreground data-[state=on]:hover:border-transparent',
          'data-[state=on]:active:bg-interaction-selected-active data-[state=on]:active:text-foreground data-[state=on]:active:border-transparent',
          'data-[state=on]:disabled:bg-none data-[state=on]:disabled:text-fg-disabled',
          'data-[state=on]:disabled:hover:bg-none data-[state=on]:disabled:hover:text-fg-disabled data-[state=on]:disabled:active:bg-none data-[state=on]:disabled:active:text-fg-disabled',
          'aria-pressed:bg-surface aria-pressed:bg-interaction-selected aria-pressed:text-foreground aria-pressed:border-transparent',
          'aria-pressed:hover:bg-interaction-selected-hover aria-pressed:hover:text-foreground aria-pressed:hover:border-transparent',
          'aria-pressed:active:bg-interaction-selected-active aria-pressed:active:text-foreground aria-pressed:active:border-transparent',
          'aria-pressed:disabled:bg-none aria-pressed:disabled:text-fg-disabled',
          'aria-pressed:disabled:hover:bg-none aria-pressed:disabled:hover:text-fg-disabled aria-pressed:disabled:active:bg-none aria-pressed:disabled:active:text-fg-disabled',
          'aria-pressed:data-[state=open]:bg-interaction-selected-hover aria-pressed:data-[state=open]:text-foreground aria-pressed:data-[state=open]:border-transparent',
          'data-[state=on]:aria-disabled:hover:bg-interaction-selected data-[state=on]:aria-disabled:active:bg-interaction-selected',
          'aria-pressed:aria-disabled:hover:bg-interaction-selected aria-pressed:aria-disabled:active:bg-interaction-selected',
        ],
      },
    ],
    defaultVariants: {
      // labeled 預設 = tertiary(2026-06-06 從 primary 改;iconOnly 預設 = text,由 resolvedVariant 注入)。
      // 真正預設邏輯在元件內 resolvedVariant(相對指法,免行號漂移);此 cva default 供直接 buttonVariants() 呼叫者一致。
      variant: 'tertiary',
      size: 'md',
      pressedTone: 'emphasis',
    },
  }
)

// ── ButtonGroup Context ──────────────────────────────────────────────────────
// ButtonGroup 提供此 context;Button 讀取它注入 fullWidth。
// Context 放本檔(不放 button-group.tsx)以避免循環 import。
interface ButtonGroupContextValue {
  fullWidth?: boolean
}
/** @internal — ButtonGroup↔Button 私有 context(fullWidth 注入);consumer 不直接 import,經 <ButtonGroup> 消費。root barrel 排除(subpath 仍可 wrap 後用)。 */
const ButtonGroupContext = React.createContext<ButtonGroupContextValue>({})

type InternalVariant = VariantProps<typeof buttonVariants>['variant']

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'variant' | 'danger'> {
  /**
   * 將樣式套用至子元件（e.g. React Router Link）。
   *
   * ⚠️ **icon-only + asChild 警告**:當 `iconOnly={true}` 且 `asChild={true}` 時,內建
   * Tooltip wrapper 不啟動(Radix Slot 不接受多 child)。consumer 必須**自管 child 的 `aria-label`**
   * 給 screen reader,並視需要自行包 `<Tooltip>`(對齊 Polaris / Radix asChild idiom)。
   * Button 不會主動補 tooltip — 否則會破壞 Slot 單 child 規則。
   */
  asChild?: boolean
  /**
   * 按鈕視覺強調等級。
   * `destructive` / `ghost` 為 shadcn 內部 compat，請勿在應用程式碼中直接使用。
   */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'text' | 'link'
  /** 套用危險色（紅色）。僅 primary / secondary / text 支援（tertiary / link 不支援，見 spec 禁止事項）。 */
  danger?: boolean
  /**
   * Toggle 按下狀態（持續 on/off）。設定時 Button 變為 toggle：
   * - 自動寫入 `aria-pressed` + `data-state="on" | "off"`
   * - 樣式由 variant × `pressedTone` 的 compoundVariants 套用
   * - 僅 secondary / tertiary / text 有 toggle 視覺；primary / link 傳入無效果
   *
   * 不傳此 prop 時 Button 就是一般按鈕，不帶 aria-pressed。
   */
  pressed?: boolean
  /**
   * Pressed 視覺色調(2026-05-21 v12 加):
   * - `'emphasis'`(預設)→ 淡藍底 / primary 字(對齊 Figma toolbar / Linear toolbar /
   *   Material ToggleButton 共識 — toolbar functional toggle / 篩選啟用 / 面板開關)
   * - `'neutral'` → 灰底 / foreground 字 —— **可取消**的切換鈕(再點一次就關掉)需要低一級強調時;
   *   導覽 / 目前頁不用它(那是選中列,滑過釘住;button.spec.md pressedTone 表,2026-09-25 更正)
   *
   * 僅在 `pressed` 啟用且 variant ∈ {secondary, tertiary, text} 時生效。
   * 跨 toggle context 維持單一 prop API,consumer 視語意選 tone 不另開 variant。
   */
  pressedTone?: 'emphasis' | 'neutral'
  /** 左側 icon（LucideIcon），最多一個，loading 時自動替換為 spinner */
  startIcon?: LucideIcon
  /** 右側 badge（ReactNode），通常傳入計數指示器 */
  badge?: React.ReactNode
  /**
   * Overlay badge(iconOnly 專用)。接收 `<Badge>` 元素,Button 內部**自動定位在 startIcon 右上角**——
   * badge 中心對齊 icon 的 top-right corner(Material BadgedBox / iOS App icon canonical),不是按鈕邊緣。
   * 解決手刻 `relative + absolute -top-1 -right-1` 讓 badge 飄在按鈕 chrome 右上的問題。
   *
   * 世界級對照:Material BadgedBox、iOS App Icon、Ant Badge wrap icon,badge 相對於**視覺重心**(icon)。
   * 只在 `iconOnly=true` 時生效;非 iconOnly 時應該用 inline `badge` prop 放 suffix 位置。
   */
  overlayBadge?: React.ReactNode
  /** 右側 icon（LucideIcon），放在 badge 右邊，通常用於 ChevronDown 等方向指示 */
  endIcon?: LucideIcon
  /** Icon-only 模式：移除 padding，變為正方形（必須同時設定 aria-label） */
  iconOnly?: boolean
  /**
   * Dismiss 視覺類(X close only canonical)。專用於 **X(close)icon 的 dismiss 語意** —
   * 「關閉 surface / 忽略訊息」。**不適用 Trash / Delete / Clear / Remove 等 destructive / clear 操作**。
   *
   * 自動套用:
   * - `variant="text"`(強制 override 其他 variant)
   * - `iconOnly=true`(強制)
   * - Icon 色 override:`fg-muted` → hover `fg-secondary`(跟 Inline Action dismiss 視覺一致)
   *
   * 典型 case:Dialog / Sheet / Popover / Alert / Toast / Coachmark 的 **chrome corner close X**
   * (action group region — corner 可多 action,close 左側加 Separator + refresh / share 等)。
   *
   * 非 dismiss(**不套此 prop**):
   * - Trash / Delete → destructive action,Button 用一般 variant 或 Inline Action(按 row size 判)
   * - Clear → 欄位清空,用 Inline Action
   * - Remove → collection 移除,用一般 Button / Inline Action
   *
   * 詳見 button.spec.md「Dismiss 視覺類」段 + patterns/element-anatomy/inline-action.spec.md
   * 「Dismiss canonical — X close only」段。
   */
  dismiss?: boolean
  /**
   * 載入中狀態：startIcon 替換為 spinner;**可聚焦的停用**(`aria-busy` + `aria-disabled`,擋掉觸發,焦點留著、Tab 走得到);
   * badge / endIcon 維持顯示以避免 layout shift。長相與原生停用相同(灰底 + 禁止符號游標)。
   * 2026-10-01 前走原生 `disabled`:按下送出的那一刻按鈕變停用,焦點被瀏覽器丟到 `<body>`(待辦總帳 N69)。
   */
  loading?: boolean
  /** 撐滿父容器寬度 */
  fullWidth?: boolean
}

// IconOnly 用 padding-free + aspect-square + flex-center 的 Polaris/Atlassian idiom
// (M17 SSOT 必可傳播 — 取代 4 個 size 的 magic-number 公式):
//   - aspect-square 鎖 width=height(來自 h-field-X)
//   - p-0 移除 px-3 (label 模式) override
//   - flex justify-center items-center(base 已有)→ SVG 自動視覺置中
// 結果:0 magic number,0 公式,0 border-deduction,任何 size / icon size 都自然正方形。
// World-class 對照:Polaris + Atlassian iconOnly 走 padding-free 派(Material/Ant 走
// padding-based)。我們選 padding-free 因 SSOT 性更強(SegmentedControl / Tag dismiss
// 等 host 全可共用同 utility class,無需各自抄公式)。詳 button.spec.md「iconOnly 鐵律」。
const ICON_ONLY_BASE = 'aspect-square p-0 min-w-0 gap-0'

// ── 可聚焦的停用(2026-10-01;規則 ds-canonical/references/keyboard-model-canonical.md「按了之後自己變停用:焦點留在原處」)──
// 根因:WHATWG「focus fixup rule」—— 握有焦點的元素被原生 `disabled` 時,焦點被重設到 viewport(= `<body>`)
// (https://github.com/whatwg/html/blob/92f248013013096b5a780afffd8377fb9a6eba87/source#L123634-L123645 "It might also happen to an input
// element when the element gets disabled.")。全 DS 一整族「按了之後自己變停用」都因此掉焦點:送出中 / 存檔後的送出鈕(N69)、分頁到頭、
// 縮放到極限、輪播到端點、加條件到上限、新對話、送出後輸入盒變空、決策卡下一題。
// 修法在 Button 根層,兩種情況不轉成原生 disabled,改 `aria-disabled="true"` + `data-disabled-focusable` + 擋掉觸發:
//   (1) 忙碌(`loading`)一律 —— React Aria isPending "disables press and hover events while retaining focusability"
//       (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria-components/src/Button.tsx#L89-L93)、
//       Primer `aria-disabled={loading}` + `onClick={loading ? undefined : onClick}`(https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/Button/ButtonBase.tsx#L93-L127)、
//       Ant `if (innerLoading || mergedDisabled) { e.preventDefault(); return }` 且 `disabled={mergedDisabled}` 不含 loading
//       (https://github.com/ant-design/ant-design/blob/bde03c864b2e9feb7f86f86d8a4b4451f8aefa6a/components/button/Button.tsx#L293-L299、#L474);
//       反例誠實列出:MUI `disabled={disabled || loading}`(https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/Button/Button.js#L595)= DS 修前的寫法。
//   (2) `disabled` 在**握有焦點的那一刻**變 true —— 直到焦點離開才換回原生 disabled(之後 Shift+Tab 回不來,照 APG 慣例 1 離開 Tab 序);
//       沒有焦點時被停用的按鈕維持原生 disabled,Tab 序與過去完全相同。「只在握著焦點時才改用可聚焦停用」這個收窄是 AI 對 APG 兩條慣例
//       (https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/practices/keyboard-interface/keyboard-interface-practice.html#L394-L396、#L414-L416、#L434)
//       與 HTML 根因的綜合,不是任何一家的原文;機制本身(aria-disabled 可聚焦 + 擋觸發)有 Material Web soft-disabled
//       (https://github.com/material-components/material-web/blob/a6b2d2640b336e5d9fc73133a317e9173827ba95/button/internal/button.ts#L39-L48)、
//       Fluent `disabledFocusable`(https://github.com/microsoft/fluentui/blob/d27922755bebae866d9ffe86b7da44c27ec801ee/packages/react-components/react-button/library/src/components/Button/Button.types.ts#L34-L41)、
//       Ariakit `accessibleWhenDisabled`(https://github.com/ariakit/ariakit/blob/c87988effdff42edf4934ded906aa32ee3c04b66/packages/ariakit-react-components/src/focusable/focusable.tsx#L607-L627)的先例。
// 長相:`styles/base.css` 把 `disabled:` 變體擴成「原生 :disabled 或 [data-disabled-focusable]」,cva 那一整組 `disabled:*` 原樣套上 —— 灰底、禁止符號,
// 與原生停用逐項相同(計算樣式對照,含滑過 / 按住);`aria-disabled:` 那套「保留品牌色 + 不透明度 + 滑過 / 按住釘在品牌色」是 Tooltip 用的
// 「看得見但不能按」長相(button.spec.md「狀態疊加」表),不是忙碌,所以這個狀態下**整組** `aria-disabled:` class 不出現(見 withoutAriaDisabledLook)。
// 為什麼在 class 層拿掉、不靠 CSS 先後:兩組同為 (0,3,0)(`.x[aria-disabled=true]:hover` vs `.y:is(:disabled,[data-disabled-focusable]):hover`),
// 誰勝由產出順序決定 —— 2026-10-07 前只拿掉了不透明度,滑過 / 按住的品牌色釘子仍在,忙碌鈕與存檔後的送出鈕一滑過就變成品牌藍配 25% 黑字
// (獨立驗證抓到;Tailwind 4.2 實測:覆寫 `aria-disabled` 變體會把它註冊成新的靜態變體、整組從 aria-* 那一段搬到 data-* 之後產出,所以也不改 CSS)。
// 擋觸發:click 先 `preventDefault` + `stopPropagation`、不呼叫 consumer(Enter / 空白合成的 click 也走這條);`type="submit"` 保留 ——
// 隱含送出(在欄位按 Enter)時瀏覽器會對「沒有被原生停用的預設按鈕」派發 click,同一個 preventDefault 就取消送出
// (https://github.com/whatwg/html/blob/92f248013013096b5a780afffd8377fb9a6eba87/source#L64546-L64552)。不採 React Aria 把 type 換成 button 的做法:
// 依 HTML,表單沒有送出鈕且只有一個會擋隱含送出的欄位時,表單會由自己送出。
// consumer 的 handler:會啟動動作的(click / 鍵盤 / 按下放開)在這個狀態一律不轉呼叫;只保留焦點與滑過類(Tooltip 要靠 onPointerMove 才會開 ——
// Radix Tooltip 在 pointermove 開啟,`@radix-ui/react-tooltip` dist/index.mjs:184)。
const PRESERVED_WHILE_DISABLED = new Set([
  'onFocus', 'onBlur', 'onFocusCapture', 'onBlurCapture',
  'onPointerEnter', 'onPointerLeave', 'onPointerOver', 'onPointerOut', 'onPointerMove',
  'onMouseEnter', 'onMouseLeave', 'onMouseOver', 'onMouseOut', 'onMouseMove',
])
function stripActivationHandlers<P extends Record<string, unknown>>(props: P): P {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (/^on[A-Z]/.test(key) && typeof value === 'function' && !PRESERVED_WHILE_DISABLED.has(key)) continue
    out[key] = value
  }
  return out as P
}
const blockActivation = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation() }
/** 可聚焦的停用時拿掉 `aria-disabled:` 那一整組長相(含 `data-[state=on]:aria-disabled:…` 這類疊在後面的),只剩原生停用那一組(見上方「長相」段)。 */
const withoutAriaDisabledLook = (classes: string) => classes.split(/\s+/).filter((c) => !/(^|:)aria-disabled:/.test(c)).join(' ')

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant: variantProp,
      danger: dangerProp,
      size,
      asChild = false,
      startIcon: StartIcon,
      badge,
      overlayBadge,
      endIcon: EndIcon,
      iconOnly = false,
      dismiss = false,
      loading = false,
      fullWidth = false,
      pressed,
      pressedTone, // 2026-06-05 fix(deep-audit P0):原漏 destructure → 落入 ...props 噴到 DOM + 永遠用 cva default
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // ── FieldContext：在 Field 內自動讀 size，讓 Button 跟 Input 同高(SSOT:useResolvedFieldSize)──
    const resolvedSize = useResolvedFieldSize(size, 'md')

    // ── Dismiss 視覺類 override(2026-04-22 cross-implementation dimming canonical) ──
    // dismiss=true 強制:variant="text" + iconOnly=true + icon 色弱化(fg-muted → hover fg-secondary)
    // 跟 Inline Action dismiss 視覺一致。詳見 button.spec.md「Dismiss 視覺類」。
    const resolvedIconOnly = iconOnly || dismiss

    // ── Dev-mode warning:overlayBadge 只適用 iconOnly ──
    // 有 label 的 Button 傳入 overlayBadge 會被忽略(只 render icon / 不渲染 overlay slot),
    // 靜默忽略會讓 consumer 誤以為「傳了但位置錯」。Dev mode 印 warning 引導改用 `badge` prop
    // (inline 位置,跟 label 並列)或改 `iconOnly`。Spec SSOT:badge.spec.md「Overlay 適用元件」。
    if (process.env.NODE_ENV !== 'production' && overlayBadge && !iconOnly) {
      console.warn(
        '[DS Button] `overlayBadge` 只適用於 `iconOnly` Button。有 label 的 Button 請改用 `badge` prop(inline 位置,跟 label 並列),或移除 label 改為 iconOnly。SSOT:badge.spec.md「Overlay 適用元件 canonical」節。'
      )
    }

    // 2026-05-23 deep-audit Phase A.4 Decision 1(user verbatim「決策ㄧ照你建議做」):dev-warn `iconOnly + (endIcon|badge)` 並用。
    // Spec SSOT:button.spec.md「iconOnly 嚴格定義為『只有一個 icon,正方形』,不可與 endIcon 或 badge 並用」。
    // 例外:overlayBadge 跟 iconOnly 並用 canonical(上方 overlayBadge 反向 warn 已 cover;相對指法,免行號漂移)。
    // 不擋 image canonical「icon + 下拉指示 = 不加 iconOnly + startIcon + endIcon + aria-label」(那 case iconOnly=false 不 trigger)。
    if (process.env.NODE_ENV !== 'production' && iconOnly && (EndIcon !== undefined || badge != null)) {
      console.warn(
        '[DS Button] `iconOnly` 嚴格定義為「只有一個 icon,正方形」,不可與 `endIcon` 或 `badge` 並用。若需 icon + 下拉指示 → 不加 iconOnly + startIcon + endIcon + aria-label;若需 icon + 角標 → iconOnly + overlayBadge。SSOT:button.spec.md `iconOnly 的邊界` 節 + `badge.spec.md` Overlay 適用元件 canonical。'
      )
    }

    // shadcn compat:AlertDialog、Toast 等元件內部會傳入這些 alias,
    // 在此靜默轉換,不暴露到型別或自動完成。
    // dismiss=true 強制 variant=text(dismiss canonical);override 其他 variant 傳入。
    // 2026-06-06 預設 emphasis 改低(對齊世界級:MUI 預設 text / Ant 預設 default / Polaris 低 emphasis —
    // 預設 primary CTA 是 outlier)。labeled 無 variant → `tertiary`(中性外框,清楚可點性,再按重要程度升 primary);
    // iconOnly 無 variant → `text`(toolbar ghost,對齊 action-bar.spec.md「純動作工具/低重量輔助 → text」+
    // Material 3「icon-only = no fill」)。**CTA 必 explicit `variant="primary"`**(不靠預設)。dismiss 仍強制 text。
    const resolvedVariant: InternalVariant =
      dismiss ? 'text' :
      (variantProp as string) === 'destructive' ? 'primary' :
      (variantProp as string) === 'ghost'        ? 'text'    :
      (variantProp as InternalVariant) ?? (iconOnly ? 'text' : 'tertiary')

    const resolvedDanger = dangerProp || (variantProp as string) === 'destructive'

    // Dev-mode warning:danger 僅 primary / secondary / text 有 compoundVariant。
    // tertiary / link + danger 無匹配 compound → **靜默渲染成一般 tertiary / link**(灰、無紅色
    // danger 視覺)— consumer 可能出「不紅的刪除鍵」而不自知。Spec SSOT:button.spec.md
    // 「禁止事項」danger 條(2026-07-14 deep-audit 補 warn,對齊既有 overlayBadge / iconOnly warn pattern)。
    if (process.env.NODE_ENV !== 'production' && resolvedDanger && (resolvedVariant === 'tertiary' || resolvedVariant === 'link')) {
      console.warn(
        `[DS Button] \`danger\` 不支援 variant="${resolvedVariant}"(無對應 compoundVariant,會靜默渲染成一般 ${resolvedVariant},無紅色 danger 視覺)。危險操作請改用 primary(立即不可逆)/ secondary(可反悔)/ text(低度)。SSOT:button.spec.md「禁止事項」danger 條。`
      )
    }

    // ButtonGroup context：vertical group 自動注入 fullWidth
    const groupCtx = React.useContext(ButtonGroupContext)
    const resolvedFullWidth = fullWidth || !!groupCtx.fullWidth

    // 可聚焦的停用(見檔頭 PRESERVED_WHILE_DISABLED 段):此刻是否握有焦點 —— 只有「握著時被停用」才改用可聚焦停用,
    // 焦點離開那一刻換回原生 disabled(事件在 blur 當下更新,下一次 render 就是原生 disabled)。
    const [holdsFocus, setHoldsFocus] = React.useState(false)
    const focusableDisabled = !asChild && (loading || (!!disabled && holdsFocus))

    const Comp = asChild ? Slot : 'button'
    const iconSize = resolvedSize === 'lg' ? 20 : 16

    // loading 行為：spinner 永遠在 prefix 位置
    //   有 prefix icon → icon 換成 spinner（同位置，零 layout shift）
    //   無 prefix icon → spinner 加在文字左邊（按鈕略微變寬，可接受）
    const hasSuffix = badge != null || EndIcon !== undefined

    // icon-only 自動 tooltip：從 props 提取 aria-label，同時保留在 DOM
    const { 'aria-label': ariaLabel, ...restProps } = props

    // Toggle 狀態：pressed 定義時自動寫入 aria-pressed + data-state。
    // 未定義時不寫入任何 toggle 屬性（按鈕為一般 action button）。
    // 樣式由 cva data-[state=on] compoundVariants（variant × pressedTone）套用——
    // secondary/tertiary/text 預設 pressedTone='emphasis' 走 primary-subtle，
    // pressedTone='neutral' 才走 neutral-selected family；primary/link 不定義 on 分支，傳入無效果。
    const toggleAttrs =
      pressed === undefined
        ? {}
        : { 'aria-pressed': pressed, 'data-state': pressed ? 'on' : 'off' }

    // Chrome-unbounded marker(2026-04-22 v5 canonical):button 若無視覺邊界(text variant 或 dismiss),
    // 標記 data-unbounded="true"。SurfaceHeader 透過 [&_[data-unbounded]]:my-[...] 套負 margin
    // 讓 layout 佔位縮到 24(chrome-header-height 幾何)— button native size 與命中區不變
    // (命中 ≡ 可視,見 ds-canonical/references/hit-area-canonical.md;2026-09-24 把原文的
    //  「touch target」正名為命中區 —— 本 DS 以滑鼠精度為前提,尺寸不以觸控門檻推導)。
    // 詳 patterns/overlay-surface/overlay-chrome-sizing.spec.md「Chrome dismiss size canonical」(2026-09-27 自 overlay-surface.spec.md 拆出)
    const unboundedAttr =
      resolvedVariant === 'text' || dismiss ? { 'data-unbounded': 'true' } : {}

    // Native path 內部結構:[loading spinner | startIcon(+overlayBadge)] [label] [badge + endIcon]。
    // asChild 時**不渲染**(2026-07-04 fix):Radix Slot 規範 children 必為單一 element
    // (React.Children.only)— 內部多 expression children 變 array 必 runtime throw;
    // asChild 分支只 render consumer child,內容由 consumer 自帶。
    // 詳 CLAUDE.md 失敗記憶索引「asChild ? Slot : Native 內部 JSX 仍渲染多 children」條。
    const nativeChildren = (
      <>
        {loading ? (
          <CircularProgress size={iconSize} className="text-current" />
        ) : StartIcon ? (
          resolvedIconOnly && overlayBadge ? (
            // Overlay badge canonical:wrapper 貼 icon 尺寸,badge 中心對齊 icon top-right corner
            // (Material BadgedBox / iOS App icon),不是 button chrome 角。
            //
            // CSS 細節(2026-04-20 bug fix):用 `inline-block` + 明確 width/height + `leading-none`
            // 避免 `inline-flex` span 在 Button flex container 內被撐高/撐寬(inline-flex 的 span
            // 在某些瀏覽器下會把絕對定位子元素的 translate 計算基準搞錯,造成 badge 噴飛、Button
            // aspect-square 失效)。明確給 span width/height = iconSize 鎖住 positioning context。
            <span
              className="relative inline-block leading-none shrink-0 pointer-events-none"
              style={{ width: iconSize, height: iconSize }}
            >
              <StartIcon size={iconSize} aria-hidden />
              <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 pointer-events-auto">
                {overlayBadge}
              </span>
            </span>
          ) : (
            <StartIcon size={iconSize} aria-hidden />
          )
        ) : null}
        {children != null && <span className="px-1">{children}</span>}
        {hasSuffix && (
          <span className="inline-flex items-center gap-1">
            {badge}
            {EndIcon && <EndIcon size={iconSize} aria-hidden />}
          </span>
        )}
      </>
    )

    // 元件自己的 cva 長相;可聚焦的停用時拿掉 aria-disabled 那一組(consumer 的 className 不動,照舊排在它後面由 twMerge 合併)
    const ownVariantClasses = buttonVariants({ variant: resolvedVariant, danger: resolvedDanger, size: resolvedSize, pressedTone })
    const sharedClassName = cn(
      focusableDisabled ? withoutAriaDisabledLook(ownVariantClasses) : ownVariantClasses,
      className,
      // iconOnly 鐵律:padding-free + aspect-square + flex-center (Polaris idiom)
      // 0 magic-number 0 公式自動正方形。詳 ICON_ONLY_BASE rationale。
      resolvedIconOnly && ICON_ONLY_BASE,
      // Dismiss 視覺弱化:override Button text variant 預設 foreground 為 fg-muted → hover fg-secondary
      // 跟 Inline Action dismiss 視覺一致(cross-implementation dimming canonical)
      // 弱化 icon hover 一階(item-anatomy.tsx ItemInlineActionButton 同階梯 SSOT)
      dismiss && 'text-fg-muted hover:text-fg-secondary',
      // aria-disabled 的 dismiss hover 釘在 fg-muted(button.spec.md「狀態疊加」表 aria-disabled 列);可聚焦的停用不是那個長相(見上方 ownVariantClasses)
      dismiss && !focusableDisabled && 'aria-disabled:hover:text-fg-muted',
      resolvedFullWidth && 'w-full',
    )

    // 2026-07-05 D4 修:asChild 原 silently drop loading/disabled 語意(無 aria-busy/aria-disabled/
    // click guard → <a> loading 期間可重複點擊)。補 ARIA(任何 element 合法;aria-disabled 自動點亮
    // cva 既有視覺)+ functional guard(APG aria-disabled 模式:語意+視覺由元件、功能阻斷由 guard)。
    const { onClick: slotConsumerOnClick, ...slotRest } = restProps as typeof restProps & { onClick?: React.MouseEventHandler<HTMLElement> }
    const buttonEl = asChild ? (
      // Slot 分支:children 必為單一 consumer element(React.Children.only),
      // 內部 slot(loading/startIcon/badge)不渲染;不硬塞 type/disabled(consumer child 可能是 <a>)。
      <Comp
        className={sharedClassName}
        ref={ref}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        onClick={disabled || loading
          ? (e: React.MouseEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation() }
          : slotConsumerOnClick}
        {...toggleAttrs}
        {...unboundedAttr}
        {...slotRest}
      >
        {children}
      </Comp>
    ) : (
      <Comp
        className={sharedClassName}
        ref={ref}
        type="button"
        // 可聚焦的停用(見檔頭):忙碌一律、disabled 在握有焦點時 → 不轉原生 disabled;其餘照舊原生
        disabled={focusableDisabled ? false : (!!disabled || loading)}
        aria-busy={loading || undefined}
        aria-disabled={focusableDisabled || undefined}
        data-disabled-focusable={focusableDisabled ? '' : undefined}
        aria-label={ariaLabel}
        {...toggleAttrs}
        {...unboundedAttr}
        {...(focusableDisabled ? stripActivationHandlers(restProps) : restProps)}
        // 握有焦點與否的追蹤只在這兩個事件(consumer 的同名 handler 已在上方 spread,這裡接著呼叫)
        onFocus={(e) => { setHoldsFocus(true); restProps.onFocus?.(e) }}
        onBlur={(e) => { setHoldsFocus(false); restProps.onBlur?.(e) }}
        // 擋掉觸發:consumer 的 onClick 已被 stripActivationHandlers 拿掉;Enter / 空白合成的 click 與表單隱含送出派來的 click 都走這一條
        {...(focusableDisabled ? { onClick: blockActivation, onDoubleClick: blockActivation } : null)}
      >
        {nativeChildren}
      </Comp>
    )

    // icon-only + aria-label → 自動包 Tooltip（tooltip 是元件保證的行為）
    // 不建立獨立 TooltipProvider——依賴全域 Provider，
    // 這樣所有 tooltip 共享同一組 delay 參數和 warm-up 機制
    if (resolvedIconOnly && typeof ariaLabel === 'string' && !asChild) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{buttonEl}</TooltipTrigger>
          <TooltipContent>{ariaLabel}</TooltipContent>
        </Tooltip>
      )
    }

    return buttonEl
  }
)
Button.displayName = 'Button'

/**
 * componentMeta — Story Auto-Compile 系統消費的結構化 canonical
 * (見 .claude/planning/story-auto-compile.md Phase 1)
 *
 * compile-stories.mjs 讀本 export + spec.md frontmatter 產出
 * anatomy.stories.tsx 的 variant/size/state/token 矩陣 canonical section。
 *
 * Keys 必跟 buttonVariants cva + spec frontmatter 對齊(compile-time 驗證)。
 */
export const buttonMeta = {
  component: 'Button',
  family: 3, // Pill Layout
  variants: {
    primary: { purpose: '主要 action / CTA' },
    secondary: { purpose: '次要 action(陪襯 primary)' },
    tertiary: { purpose: '第三級 action(tool-like)' },
    text: { purpose: '文字樣式 action(low emphasis / toolbar)' },
    link: { purpose: '內文連結(inline reading)' },
  },
  sizes: {
    xs: { fieldHeight: 24, iconSize: 16, typography: 'caption' },
    sm: { fieldHeight: 28, iconSize: 16, typography: 'body' },
    md: { fieldHeight: 32, iconSize: 16, typography: 'body' },
    lg: { fieldHeight: 36, iconSize: 20, typography: 'body-lg' },
  },
  // 'pressed' = toggle on 持續態(data-[state=on],emphasis 淡藍底/neutral 灰底;2026-07-07 meta 詞彙統一補列)
  // 'loading' = CircularProgress spinner 取代 startIcon + aria-busy + click guard(2026-07-14 deep-audit
  // 補列,原漏 → auto-compile 生成矩陣缺 loading;對齊 anatomy StateBehavior Loading 行 + tsx loading 分支)
  states: ['default', 'hover', 'active', 'pressed', 'loading', 'focus-visible', 'disabled'],
  tokens: {
    // 2026-07-04 audit 補齊:原只列 primary variant 家族;按 buttonVariants cva 真實 class 補
    // secondary/tertiary/text/link/danger 消費的 token(auto-compile token 矩陣依此)。
    // 2026-07-14 deep-audit 二次補齊(掃 cva 全 bg-* class):+ neutral-selected-hover / neutral-selected-active
    // (neutral pressedTone compound 消費)+ error / error-hover / error-active(primary+danger bg-error 系)
    bg: ['--primary', '--primary-hover', '--primary-active', '--primary-subtle', '--bg-disabled', '--surface', '--neutral-hover', '--neutral-active', '--neutral-selected', '--neutral-selected-hover', '--neutral-selected-active', '--error', '--error-hover', '--error-active'],
    fg: ['--on-emphasis', '--fg-disabled', '--foreground', '--primary', '--primary-hover', '--primary-active', '--error', '--error-hover', '--error-active'],
    ring: ['--ring'],
  },
  defaultVariant: 'tertiary',  // 2026-06-10 修 stale:對齊 cva defaultVariants(2026-06-06 labeled 預設改 tertiary,meta 漏同步)
  defaultSize: 'md',
} as const

export { Button, buttonVariants, ButtonGroupContext }
