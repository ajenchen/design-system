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
    'transition-colors duration-150',
    'cursor-pointer select-none disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    // 2026-05-12 Round 4.5 fix(codex M31 Layer C 抓):`aria-disabled` visual 分支補(per WAI-ARIA APG —
    // aria-disabled 給語意 + visual,但不 suppress functionality;functionality 由 consumer 阻 e.g.
    // RowDragHandle listeners 只在 canDrag spread)。**故意不加** `aria-disabled:pointer-events-none`
    // — Round 4 RowDragHandle Tooltip flicker fix root cause:aria-disabled buttons 必保 pointer events
    // 讓 Radix Tooltip pointerenter 通過。HTML `disabled` 保 PE:none(完全 inactive)。
    'disabled:pointer-events-none',
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
          'disabled:bg-disabled disabled:text-fg-disabled disabled:border-transparent',
        ],
        secondary: [
          'bg-surface text-primary border-primary',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          // Overlay trigger active(asChild Popover/DropdownMenu trigger)— 維持 hover 樣式
          // (canonical 對齊 inline-action.spec.md:trigger 維持 host hover 直到 overlay 關閉)
          'data-[state=open]:text-primary-hover data-[state=open]:border-primary-hover',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
          // 2026-05-21 v12:Toggle pressed 視覺移到 compoundVariants(variant × pressedTone),
          // 同時支援 emphasis(藍底)/ neutral(灰底)兩 tone。詳 cva.compoundVariants 段。
        ],
        tertiary: [
          'bg-surface text-foreground border-border',
          'hover:text-primary-hover hover:border-primary-hover',
          'active:text-primary-active active:border-primary-active',
          // Overlay trigger active — 維持 hover 樣式(同 secondary 邏輯)
          'data-[state=open]:text-primary-hover data-[state=open]:border-primary-hover',
          'disabled:bg-transparent disabled:text-fg-disabled disabled:border-border',
        ],
        text: [
          'bg-transparent text-foreground border-transparent',
          'hover:bg-neutral-hover',
          'active:bg-neutral-active',
          // Overlay trigger active — 維持 hover 樣式(canonical 2026-05-02 改:hover token,
          // 不另開 selected 4% — 對齊 shadcn/Radix/Material 狀態極簡派,跨 host 一致)
          'data-[state=open]:bg-neutral-hover',
          'disabled:bg-transparent disabled:text-fg-disabled',
        ],
        link: [
          'bg-transparent text-primary border-transparent',
          'hover:text-primary-hover',
          'active:text-primary-active',
          'disabled:text-fg-disabled',
        ],
      },
      danger: {
        true: '', // 實際樣式由 compoundVariants 提供
      },
      /**
       * 2026-05-21 v12 — pressed visual tone(per user「我認同這一個方向,然後預設emphasis」):
       * emphasis = 淡藍底(toolbar functional toggle / 篩選啟用 / 面板開關 — Figma toolbar /
       *            Linear toolbar / Material ToggleButton 共識)
       * neutral  = 灰底(sidebar/contextual nav row pressed — Linear / Notion / VS Code Activity Bar 共識)
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
          'data-[state=on]:hover:text-primary-hover',
          'data-[state=on]:active:text-primary-active',
          'data-[state=on]:disabled:bg-disabled data-[state=on]:disabled:text-fg-disabled data-[state=on]:disabled:border-transparent',
          // aria-pressed fallback(Radix overlay trigger override data-state 時仍生效)
          'aria-pressed:bg-primary-subtle aria-pressed:text-primary aria-pressed:border-transparent',
          'aria-pressed:hover:text-primary-hover',
        ],
      },
      // neutral tone:灰底(neutral-selected family)— sidebar/contextual nav pressed
      {
        variant: ['secondary', 'tertiary', 'text'],
        pressedTone: 'neutral',
        class: [
          'data-[state=on]:bg-neutral-selected data-[state=on]:text-foreground data-[state=on]:border-transparent',
          'data-[state=on]:hover:bg-neutral-selected-hover',
          'data-[state=on]:active:bg-neutral-selected-active',
          'data-[state=on]:disabled:bg-transparent data-[state=on]:disabled:text-fg-disabled',
          // aria-pressed fallback
          'aria-pressed:bg-neutral-selected aria-pressed:text-foreground aria-pressed:border-transparent',
          'aria-pressed:hover:bg-neutral-selected-hover',
        ],
      },
    ],
    defaultVariants: {
      // labeled 預設 = tertiary(2026-06-06 從 primary 改;iconOnly 預設 = text,由 resolvedVariant 注入)。
      // 真正預設邏輯在元件 resolvedVariant(L394);此 cva default 供直接 buttonVariants() 呼叫者一致。
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
   * - `'neutral'` → 灰底 / foreground 字(對齊 Linear / Notion / VS Code Activity Bar
   *   共識 — sidebar/contextual nav row pressed)
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
   * - Icon 色 override:`fg-muted` → hover `foreground`(跟 Inline Action dismiss 視覺一致)
   *
   * 典型 case:Dialog / Sheet / Popover / Alert / Toast / Coachmark 的 **chrome corner close X**
   * (action group region — corner 可多 action,close 左側加 Separator + refresh / share 等)。
   *
   * 非 dismiss(**不套此 prop**):
   * - Trash / Delete → destructive action,Button 用一般 variant 或 Inline Action(按 row size 判)
   * - Clear → 欄位清空,用 Inline Action
   * - Remove → collection 移除,用一般 Button / Inline Action
   *
   * 詳見 button.spec.md「Dismiss 視覺類」段 + patterns/element-anatomy/item-anatomy.spec.md
   * 「Dismiss canonical — X close only」段。
   */
  dismiss?: boolean
  /** 載入中狀態：startIcon 替換為 spinner，自動 disabled；badge / endIcon 維持顯示以避免 layout shift */
  loading?: boolean
  /** 撐滿父容器寬度 */
  fullWidth?: boolean
}

/**
 * Icon-only padding — calc `(field-height - icon-size) / 2` per size。
 *
 * 設計:startIcon 到左邊距離 = padding = `(height - icon) / 2`。
 * 純 icon-only 時 width = 2*padding + icon = height → **自然正方形**,不需要 aspect-square。
 * 有 suffix(badge / endIcon)時 width = 2*pad + icon + gap + suffix > height → **自然長方形**。
 * StartIcon 到左邊距離始終不變,形狀自動適應內容。
 *
 * 用 CSS var 讓 density 切換時 padding 自動跟著算(field-height 會變)。
 */
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
    // dismiss=true 強制:variant="text" + iconOnly=true + icon 色弱化(fg-muted → hover foreground)
    // 跟 Inline Action dismiss 視覺一致。詳見 button.spec.md「Dismiss 視覺類」。
    const resolvedIconOnly = iconOnly || dismiss

    // ── Dev-mode warning:overlayBadge 只適用 iconOnly ──
    // 有 label 的 Button 傳入 overlayBadge 會被忽略(只 render icon / 不渲染 overlay slot),
    // 靜默忽略會讓 consumer 誤以為「傳了但位置錯」。Dev mode 印 warning 引導改用 `badge` prop
    // (inline 位置,跟 label 並列)或改 `iconOnly`。Spec SSOT:badge.spec.md「Overlay 適用元件」。
    if (process.env.NODE_ENV !== 'production' && overlayBadge && !iconOnly) {
      // eslint-disable-next-line no-console
      console.warn(
        '[DS Button] `overlayBadge` 只適用於 `iconOnly` Button。有 label 的 Button 請改用 `badge` prop(inline 位置,跟 label 並列),或移除 label 改為 iconOnly。SSOT:badge.spec.md「Overlay 適用元件 canonical」節。'
      )
    }

    // 2026-05-23 deep-audit Phase A.4 Decision 1(user verbatim「決策ㄧ照你建議做」):dev-warn `iconOnly + (endIcon|badge)` 並用。
    // Spec SSOT:button.spec.md「iconOnly 嚴格定義為『只有一個 icon,正方形』,不可與 endIcon 或 badge 並用」。
    // 例外:overlayBadge 跟 iconOnly 並用 canonical(L372 反向 warn 已 cover)。
    // 不擋 image canonical「icon + 下拉指示 = 不加 iconOnly + startIcon + endIcon + aria-label」(那 case iconOnly=false 不 trigger)。
    if (process.env.NODE_ENV !== 'production' && iconOnly && (EndIcon !== undefined || badge != null)) {
      // eslint-disable-next-line no-console
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

    // ButtonGroup context：vertical group 自動注入 fullWidth
    const groupCtx = React.useContext(ButtonGroupContext)
    const resolvedFullWidth = fullWidth || !!groupCtx.fullWidth

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
    // 讓 layout 佔位縮到 24(chrome-header-height 幾何)— button native size 與 touch target 不變。
    // 詳 overlay-surface.spec.md「Chrome dismiss size canonical」
    const unboundedAttr =
      resolvedVariant === 'text' || dismiss ? { 'data-unbounded': 'true' } : {}

    const buttonEl = (
      <Comp
        className={cn(
          buttonVariants({ variant: resolvedVariant, danger: resolvedDanger, size: resolvedSize, pressedTone, className }),
          // iconOnly 鐵律:padding-free + aspect-square + flex-center (Polaris idiom)
          // 0 magic-number 0 公式自動正方形。詳 ICON_ONLY_BASE rationale。
          resolvedIconOnly && ICON_ONLY_BASE,
          // Dismiss 視覺弱化:override Button text variant 預設 foreground 為 fg-muted → hover foreground
          // 跟 Inline Action dismiss 視覺一致(cross-implementation dimming canonical)
          dismiss && 'text-fg-muted hover:text-foreground',
          resolvedFullWidth && 'w-full',
        )}
        ref={ref}
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
        {...toggleAttrs}
        {...unboundedAttr}
        {...restProps}
      >
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
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['--primary', '--primary-hover', '--primary-active', '--bg-disabled'],
    fg: ['--on-emphasis', '--fg-disabled'],
    ring: ['--ring'],
  },
  defaultVariant: 'tertiary',  // 2026-06-10 修 stale:對齊 cva defaultVariants(2026-06-06 labeled 預設改 tertiary,meta 漏同步)
  defaultSize: 'md',
} as const

export { Button, buttonVariants, ButtonGroupContext }
