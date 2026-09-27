// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { Star, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode } from '@/design-system/components/Field/field-context'
import { fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

/**
 * Rating — 星星評分元件
 *
 * 世界級對照:Ant Design `<Rate>`、Material MUI `<Rating>`。
 * shadcn 核心沒有 Rating,本元件自建。
 *
 * ── 使用情境 ──
 * - review / feedback:商品評分 / 服務評分(可編輯 + 唯讀兩種)
 * - view:已提交評分的唯讀呈現(商品清單星等)
 *
 * ── 視覺 ──
 * 填色用 `var(--warning)`(yellow-6,世界級黃星 convention;與 warning 語意共用色相
 * 但語境不同,評分 = UX convention color 非 status)。
 * 空色用 `var(--divider)`(neutral-4 借 divider semantic alias;灰色;與 disabled/empty 同級)。
 *
 * ── 互動 ──
 * interactive(預設):只有整顆星 —— hover 預覽、click 設值、keyboard ±1
 * readOnly:一律精簡版「★ 4.7 (12,843)」—— 一顆實心星 + 數值 + 選填評論數,不畫五顆星
 *   (user 2026-09-26:「唯讀直接一律給精簡版就好吧？搞得這麼麻煩幹嘛？其他照你建議」;
 *   rating.spec.md「Interactive vs ReadOnly」)
 */

// ── Icon size canonical(2026-04-21 AR48 修正)──
//
// Rating 的「一顆星」視覺重量接近 **Avatar / identity icon**,不是純 inline icon。
// 理由:
// - 星星是 filled shape(解析整個 icon 是重量感的一部分),不像純 outline icon 靠 stroke
// - Field 內 Rating 跟 Avatar / Tag 並排時視覺份量要對齊,否則 row height 一致但 icon 看起來比重量不對
//
// 因此可以點的星對齊 **item-anatomy inline Avatar sizes**:sm=20 / md=24 / lg=24。
// 非 icon tier(16/16/20)——star 不是次要 affordance icon,它是主要資料視覺。
//
// ── 高度模型(2026-09-27;user:「我反而覺得其跟 switch 和 checkbox 十分接近的邏輯」)──
// 元件只有內容高、不吃 `--field-height-*` 容器:可以點的評分根高 = 星高;唯讀精簡版 = 星與文字行高的較大者。
// 列高由所在的列供給 —— Field 控件槽 `min-h-field-* + items-center`(field.tsx)、表格格子、列的 items-center。
// 世界級六家(MUI / Ant / Fluent / Mantine / Chakra / PrimeReact)評分根容器都 hug 星、表單對齊交給表單列;
// 之前自己吃容器會把 Field 外的列撐高(商品卡 24 容器實佔 26px),對命中零幫助。出處與實量:rating.spec.md「Size」。
// xs 於同日退役(可以點的 xs 與 sm 只差容器;唯讀 xs 是 AI 自訂、無 user 同意、產品零處)。
type RatingSize = 'sm' | 'md' | 'lg'
const SIZE_PX: Record<RatingSize, number> = { sm: 20, md: 24, lg: 24 }

export interface RatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** 當前評分(0 ~ max) */
  value?: number
  /** 預設值(uncontrolled) */
  defaultValue?: number
  /** 評分改變 callback */
  onChange?: (value: number) => void
  /** 滿分(預設 5) */
  max?: number
  /** 尺寸,同 Switch / Checkbox:明傳最優先,否則跟所在容器(Field 明確指定的 size、表格 surface size),都沒有才 md。沒有 xs(2026-09-27 退役) */
  size?: RatingSize
  /** 唯讀:顯示精簡版「★ 數值 (評論數)」,不響應 hover / click / 鍵盤 */
  readOnly?: boolean
  /** 唯讀時顯示在數值後的評論數(千分位);interactive 時不顯示 */
  count?: number
  /** 完全停用 */
  disabled?: boolean
  /**
   * Loading 狀態 — 正在取得既有評分 / 正在儲存。
   * 視覺同 disabled(composite 整塊 opacity-disabled)但 semantic 不同:
   * loading = 暫時性等待(aria-busy),disabled = 永久業務規則(aria-disabled)。
   * 詳 rating.spec.md「Interactive vs ReadOnly」+「Loading canonical」
   */
  loading?: boolean
  /** 自訂 icon(預設 Star);傳 LucideIcon */
  icon?: LucideIcon
  /**
   * a11y label。readOnly(role=img)時必填。
   * interactive(role=slider)時:在 Field 內免填(自動 aria-labelledby 指向 FieldLabel);
   * standalone(無 Field)時必填——role=slider 依 WAI-ARIA APG 必有 accessible name。
   */
  'aria-label'?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Rating = React.forwardRef<HTMLDivElement, RatingProps>(
  (
    {
      value,
      defaultValue = 0,
      onChange,
      max = 5,
      size: sizeProp,
      readOnly: readOnlyProp = false,
      count,
      disabled: disabledProp,
      loading = false,
      icon: Icon = Star,
      className,
      ...props
    },
    ref,
  ) => {
    // 2026-07-18 決策4:max dev-warn(spec canonical ≤7;維持 number 型別不收窄,對齊 MUI Rating.max)。
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production' && (max > 7 || max < 1 || Math.round(max) !== max)) {
      console.warn(`[DS] Rating max ${max} 超出 canonical 範圍 1-7(或非整數)。建議 ≤7 顆星(對齊世界級 review-stars)。`)
    }
    const fieldCtx = useFieldContext()  // 保留:aria-labelledby 用 fieldCtx.labelId
    // 2026-06-08 SSOT:<Field disabled> cascade(原 isInteractive 只看 local disabled prop)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // <Field mode="readonly"> cascade(2026-06-12 補):Rating 的 readonly 呈現 = 唯讀精簡版「★ 數值」
    // (2026-09-26 起;role=img)——不包灰框,只鎖互動。
    const resolvedMode = useResolvedFieldMode({ mode: undefined, disabled, readOnly: readOnlyProp })
    const readOnly = readOnlyProp || resolvedMode === 'readonly'
    // 尺寸解析(field-context useResolvedFieldSize):prop > Field 明確指定的 size > Field 預設 md > 表格 surface size > md。
    // 不傳 fallback:傳了會排在 Field 預設與 surface size 前面(那是 Switch / Checkbox 的 'md' 寫法,表格格子就接不到 surface size);
    // Rating 在表格格子裡要跟表格(rating.spec.md「Size」:使用時機 = 跟所在容器)。
    // 執行期傳 'xs'(型別已拒,JS consumer / 舊 d.ts 仍可能傳)→ 映到 sm 並 dev-warn(靜默映射 = 零訊號);閘 scripts/test-rating-field-size.mjs。
    const legacyXs = (sizeProp as string | undefined) === 'xs'
    if (legacyXs && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn('[DS] Rating size="xs" 已於 2026-09-27 退役(改為 sm;元件只有內容高,列高由所在的列供給)。')
    }
    const size = useResolvedFieldSize<RatingSize>(legacyXs ? 'sm' : sizeProp)
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const [hoverValue, setHoverValue] = React.useState<number | null>(null)
    const valueTextId = React.useId()
    const isControlled = value !== undefined
    const currentValue = isControlled ? value : internalValue
    // 可以點的評分只有整顆:外部給小數時四捨五入成整顆,畫面、鍵盤起點、讀屏念的值三者同一個數
    // (否則 4.7 按 ← 會變 3.7、讀屏念 3.7 卻畫 4 顆)
    const wholeValue = Math.max(0, Math.min(max, Math.round(currentValue)))
    const displayValue = hoverValue ?? wholeValue
    const iconPx = SIZE_PX[size]
    const isInteractive = !readOnly && !disabled && !loading

    // ── 唯讀 = 精簡版「★ 4.7 (12,843)」────────────────────────────────────────
    // 世界級:Fluent 2 把唯讀拆成 RatingDisplay,`compact`「Renders a single filled star, with the value
    // written next to it」、`count`「formatted with a thousands separator … displayed next to the value」
    // (github.com/microsoft/fluentui react-rating `RatingDisplay.types.ts`,2026-09-26 讀 master)。
    // 本 DS 不另拆元件:唯讀一律走這條,互動才畫五顆星(user 2026-09-26 選的是「唯讀一律精簡版」)。
    // 星走 icon tier(16 / 16 / 16 / 20);星 ↔ 數值的縫四個尺寸都是 gap-1 4px —— Rating 內只有一種縫(可以點的星與星之間也是 4px),
    // user 2026-09-27 拍板(原話「我覺得星號與文字gap應該跟這個一樣都是4px吧？」→「照你建議」);Fluent 2 RatingDisplay 16px 星 + 12px 字
    // 亦是 4px、Tag 資料指示器圖示 ↔ 文字 4px。出處、實量與世界級對照見 rating.spec.md「唯讀精簡版」。
    if (readOnly) {
      const shown = Math.max(0, Math.min(max, currentValue))
      return (
        <div
          ref={ref}
          role="img"
          data-size={size}
          // Field 內:名稱 = 欄位標籤 + 數值(role=img 的子內容讀屏不念,只指標籤會只聽到「滿意度」聽不到分數);
          // standalone 沒有 labelId → 走 consumer 的 aria-label(規格必填)
          aria-labelledby={fieldCtx?.labelId ? `${fieldCtx.labelId} ${valueTextId}` : undefined}
          aria-disabled={disabled || undefined}
          aria-busy={loading || undefined}
          className={cn(
            // 不換行:星、數值、評論數是同一個值,窄容器裡折行會把整列撐高一倍(lg 實測 48px)。
            // 高度 = 星與文字行高的較大者(sm/md 21、lg 24),沒有容器;星 ↔ 數值 gap-1(Rating 內只有一種縫)
            'inline-flex items-center whitespace-nowrap gap-1',
            fieldDisplayTextClass(size),
            (disabled || loading) && 'opacity-disabled pointer-events-none',
            className,
          )}
          {...props}
        >
          <Icon size={size === 'lg' ? ICON_SIZE.lg : ICON_SIZE.sm} fill={FILL_FILLED} stroke="none" aria-hidden
            className="shrink-0" style={{ color: FILL_FILLED }} />
          <span id={valueTextId} aria-hidden className="text-foreground tabular-nums">
            {formatRatingValue(shown)}
            {count !== undefined && <span className="text-fg-secondary">{` (${count.toLocaleString()})`}</span>}
          </span>
        </div>
      )
    }

    const setValue = (v: number) => {
      if (!isControlled) setInternalValue(v)
      onChange?.(v)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return
      const step = 1 // 只有整顆(rating.spec.md「Interactive vs ReadOnly」)
      // Full ARIA slider pattern(WAI-ARIA):Arrow / Home / End 支援 — D4 UX audit 2026-04-22
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setValue(Math.min(max, wholeValue + step))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setValue(Math.max(0, wholeValue - step))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setValue(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setValue(max)
      }
    }

    return (
      <div
        ref={ref}
        role={isInteractive ? 'slider' : 'img'}
        data-size={size}
        // a11y(#30):role=slider 必有 accessible name(WAI-ARIA APG slider pattern)。
        //   Field 內 → 自動 aria-labelledby 指向 FieldLabel 的 id(fieldCtx.labelId,免填);
        //   Standalone → 仍需 consumer 傳 aria-label。對齊 TimePicker / DatePicker 同 canonical
        //   (time-picker.tsx:313 / date-picker.tsx:514:aria-labelledby={fieldCtx?.labelId})。
        //   置於 {...props} 前,consumer 顯式傳的 aria-labelledby 仍可覆寫。
        aria-labelledby={fieldCtx?.labelId}  // 2026-06-12 修:readonly/disabled(role=img)也需 accessible name,labelledby 對 img 合法
        aria-valuenow={isInteractive ? wholeValue : undefined}
        aria-valuemin={isInteractive ? 0 : undefined}
        aria-valuemax={isInteractive ? max : undefined}
        aria-valuetext={isInteractive ? `${wholeValue} of ${max} stars` : undefined}
        aria-disabled={disabled || undefined}
        // a11y: 刻意不設 aria-readonly — readOnly 時 role=img(axe aria-allowed-attr 禁 img 用 aria-readonly,2026-04-25);
        //       interactive 時 role=slider 但必非 readOnly(isInteractive = !readOnly)。兩 state 皆不該有此屬性,故省略。
        aria-busy={loading || undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => setHoverValue(null)}
        // 星與星之間的縫(`gap-1`;元件只有內容高,沒有上下留白):指標從某顆星移進來時,那顆星的預覽照舊亮著
        // (只有離開整個元件才收);亮著時在這裡點下去 = 確認正在預覽的值(AI 建議,2026-09-26 列在
        // 「其餘建議」裡、user 未另提 → 照建議做,AI 判讀;hit-area-canonical.md 滑過原則一-6)。
        // 點在星上由星自己處理(e.target 是星,不是容器),不會重複送出。
        onClick={isInteractive ? (e) => {
          if (e.target === e.currentTarget && hoverValue !== null) setValue(hoverValue)
        } : undefined}
        className={cn(
          // 元件只有內容高(= 星高);列高由所在的列供給(見檔頭「高度模型」)。焦點框跟著這個內容盒(rounded-md)
          'inline-flex items-center gap-1 rounded-md',
          // 預覽亮著時縫裡點得到 → 縫裡也是手形(與星同一個游標)
          isInteractive && hoverValue !== null && 'cursor-pointer',
          // disabled 跟 loading 視覺相同(composite uniform dim),semantic 由 aria-disabled / aria-busy 區分
          (disabled || loading) && 'opacity-disabled pointer-events-none',
          className,
        )}
        {...props}
      >
        {Array.from({ length: max }, (_, i) => {
          const starValue = i + 1
          return (
            <StarIcon
              key={i}
              Icon={Icon}
              sizePx={iconPx}
              // 只有整顆:displayValue 已是整數(wholeValue 四捨五入,同 Zag rating-group 沒開半顆時 `Math.round`)
              filled={displayValue >= starValue}
              interactive={isInteractive}
              onHover={() => { if (isInteractive) setHoverValue(starValue) }}
              onClick={() => { if (isInteractive) setValue(starValue) }}
            />
          )
        })}
      </div>
    )
  },
)
Rating.displayName = 'Rating'

// ── StarIcon: 單顆整星(可以點的評分用;唯讀精簡版直接畫一顆實心星)─────────────

interface StarIconProps {
  Icon: LucideIcon
  sizePx: number
  filled: boolean
  interactive: boolean
  onHover: () => void
  onClick: () => void
}

const FILL_FILLED = 'var(--warning)' // yellow-6 — 黃星 convention
const FILL_EMPTY = 'var(--divider)' // 灰色空星(neutral-4 借 divider semantic alias,user 2026-05-09 拍板;對齊 Material rgba(0,0,0,0.26) muted-fill canonical)

/** 唯讀數值:整數照原樣,小數取一位(4 → "4"、4.7 → "4.7"、4.25 → "4.3");不走 locale,避免小數點變逗號 */
function formatRatingValue(value: number): string {
  return Number.isInteger(value) ? String(value) : (Math.round(value * 10) / 10).toString()
}

function StarIcon({ Icon, sizePx, filled, interactive, onHover, onClick }: StarIconProps) {
  // a11y(2026-04-25 axe nested-interactive fix):inner 點擊目標改 <span>(非 interactive
  // element),不會跟外層 role='slider' 形成 nested-interactive 違規。鍵盤控制統一在外層
  // slider 的 arrow keys,inner 只處理 mouse click 定位。Ant Rate / Material MUI 同模式。
  const fill = filled ? FILL_FILLED : FILL_EMPTY
  return (
    <span
      role="presentation"
      onMouseEnter={interactive ? onHover : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'inline-flex',
        interactive ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{ color: fill }}
      aria-hidden
    >
      {/* stroke="none" 移除 Lucide Star 預設的 outline stroke(lucide defaultAttributes
          strokeWidth=2 + stroke=currentColor 會畫輪廓),讓星星是純 fill-only 的 shape——
          fill 與 outline 同色視覺上仍有亮度差。
          世界級對照:Ant Rate / Material MUI Rating 皆純 fill,無 outline stroke。*/}
      <Icon size={sizePx} fill={fill} stroke="none" className="shrink-0" />
    </span>
  )
}

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const ratingMeta = {
  component: 'Rating',
  family: null, // self-contained primitive(對齊 spec frontmatter self-contained + body L24;非 Family 4)
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-transparent'],
    fg: [],
    ring: ['--ring'],
  },
} as const

export { Rating }
