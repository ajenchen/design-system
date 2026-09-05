// ────────────────────────────── 消費的 SSOT ──────────────────────────────
// - Button:../Button/button.tsx —— 全部按鈕純 variant 組裝零視覺客製(2026-07-06 user 抓出):
//   上下頁 = text iconOnly / 未選數字 = text / 當前頁 = secondary(rest primary 描邊染字不染底、
//   hover 升 hover 階、active 深一階 —— 與 semantic.css「選中」canonical + 拍板 #8 完全同拼寫);
//   選中「語意」由 aria-current="page" 承載(非 pressed —— pressed 是可取消 toggle,當前頁不可取消)
// - Select(size="sm"):../Select/select.tsx —— 完整形態的「N 筆/頁」選單
// - Ellipsis icon:MoreHorizontal(packages/design-system/ds-canonical/rules/ui-development.md「Icon canonical」)
// - DOM 骨架:shadcn Pagination(nav > ul > li + aria-current="page");
//   controlled 事件驅動 + total/pageSize 資料模型對齊 Ant Pagination(2026-07-06 user 拍板:
//   Pagination 本體 = 完整功能 SSOT —— showTotal / 每頁筆數皆本元件 own,Table 轉發 config 消費)
// 設計規則:./pagination.spec.md
import * as React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { Select } from '@/design-system/components/Select/select'
import { useControllable } from '@/design-system/hooks/use-controllable'

// MUI usePagination 預設同款(boundaryCount/siblingCount = 1/1)。內部常數不開 props(M21
// 最小 API);未來若開放,命名必沿用 MUI siblingCount / boundaryCount。
// 最大格位 = 首尾各 1 + 當前頁左右各 1 + 當前頁 + 2 顆 ellipsis = 7,超過即摺疊。
const BOUNDARY_COUNT = 1
const SIBLING_COUNT = 1
/**
 * 窄容器時把 sibling 轉成 0 —— 格位 7 → 5(`1 … [5] … 12`)。
 * 這**不是新機制,是轉既有參數**:`boundary` / `sibling` 本來就是摺疊演算法的入參,
 * MUI(`usePagination` 的 `boundaryCount=1` / `siblingCount=1`)與 Primer
 * (`marginPageCount=1` / `surroundingPageCount=2`)都把這兩顆旋鈕開成公開 API,
 * 只是交給開發者手填。**「隨容器寬自動轉」是我們的組合,沒有現成一家這樣做**(M22 誠實標註)。
 * 關鍵是它**不改變瀏覽模式**:一樣是數字頁碼派,只是視窗變小 —— 這條線是 2026-09-04 user 定的。
 */
const SIBLING_COUNT_NARROW = 0

type PaginationSlot = number | 'ellipsis-start' | 'ellipsis-end'

/**
 * 窄容器階梯:每一階砍掉的都**不是導覽模型本身**,所以數字頁碼一路活到最窄。
 *
 *   0 full         第 1–20 筆,共 128 筆   ◀ 1 … 4 [5] 6 … 12 ▶   [20 筆/頁 ▾]
 *   1 no-sizer     ── 收「每頁筆數」(是**設定**,不是導覽)
 *   2 compact      ── 格位 7 → 5(**同一模式,視窗變小**;轉 sibling 參數)
 *   3 pages-only   ── 收「第 x–y 筆」(是 opt-in **資訊**)
 *   (再窄)         ── 一列不換行不截斷,整條橫向可捲
 *
 * **量的是容器不是視窗**(ResizeObserver,對齊 Carbon 用 container query 的量測語意):
 * 視窗可能是 1440px 而表格被側欄擠成 300px,`sm:`/`lg:` 這類視窗斷點在那個情境一律判「寬螢幕」。
 * 用 ResizeObserver 而不是 CSS container query,是因為第 2 階(改格位數)本來就得在 JS 做,
 * 用兩套機制守同一條階梯只會讓它們有機會不同步。
 *
 * **門檻不寫死**:總筆數變六位數、頁數變四位數時任何固定 px 都會錯。改成量各階的自然寬
 * (子元素寬總和 + gap —— 子元素都 `shrink-0`、文字 `nowrap`,所以那個值與容器寬無關),
 * 記進 `needRef` 再挑最高的可容納階。`Math.max` 只增不減 → 收斂,不會在兩階之間來回跳。
 */
const NARROW_TIERS = 4 // 0 full / 1 no-sizer / 2 compact-pages / 3 pages-only

function useNarrowTier(navRef: React.RefObject<HTMLElement>) {
  const [tier, setTier] = React.useState(0)
  const needRef = React.useRef<number[]>([])
  const tierRef = React.useRef(tier)
  tierRef.current = tier

  const measure = React.useCallback(() => {
    const el = navRef.current
    if (!el) return
    const kids = Array.from(el.children) as HTMLElement[]
    if (kids.length === 0) return
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0
    const need = kids.reduce((a, k) => a + k.getBoundingClientRect().width, 0) + gap * (kids.length - 1)
    const avail = el.clientWidth
    const t = tierRef.current
    needRef.current[t] = Math.max(needRef.current[t] ?? 0, need)
    if (need > avail + 0.5 && t < NARROW_TIERS - 1) setTier(t + 1)
    else if (t > 0 && (needRef.current[t - 1] ?? Infinity) <= avail) setTier(t - 1)
  }, [navRef])

  React.useLayoutEffect(() => { measure() })
  React.useEffect(() => {
    const el = navRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [navRef, measure])

  return tier
}

// 摺疊演算法照 MUI usePagination(1/1 配置);兩顆 ellipsis 用 distinct 穩定 key
// (Breadcrumb Math.random key remount 前車之鑑,breadcrumb.tsx:208-210)。
function getPaginationRange(page: number, totalPages: number, siblingCount: number): PaginationSlot[] {
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i)

  // 全部放得下(≤ 7 頁)→ 不摺疊
  if (totalPages <= BOUNDARY_COUNT * 2 + siblingCount * 2 + 3) return range(1, totalPages)

  const startPages = range(1, BOUNDARY_COUNT)
  const endPages = range(totalPages - BOUNDARY_COUNT + 1, totalPages)
  const siblingsStart = Math.max(
    Math.min(page - siblingCount, totalPages - BOUNDARY_COUNT - siblingCount * 2 - 1),
    BOUNDARY_COUNT + 2,
  )
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, BOUNDARY_COUNT + siblingCount * 2 + 2),
    totalPages - BOUNDARY_COUNT - 1,
  )

  return [
    ...startPages,
    ...(siblingsStart > BOUNDARY_COUNT + 2
      ? (['ellipsis-start'] as const)
      : [BOUNDARY_COUNT + 1]),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < totalPages - BOUNDARY_COUNT - 1
      ? (['ellipsis-end'] as const)
      : [totalPages - BOUNDARY_COUNT]),
    ...endPages,
  ]
}

export interface PaginationProps extends React.ComponentPropsWithoutRef<'nav'> {
  /** 資料總筆數(Ant `total` 同款資料模型;<= 0 不渲染)。總頁數 = ceil(total / pageSize) 內部推導。 */
  total: number
  /** 每頁筆數(controlled;搭配 onPageSizeChange)。不傳 = uncontrolled(defaultPageSize 起始)。 */
  pageSize?: number
  /** uncontrolled 每頁筆數初始值(預設 20)。 */
  defaultPageSize?: number
  /** 當前頁(1-based,controlled)。不傳 = uncontrolled(defaultPage 起始)。越界防禦性 clamp。 */
  page?: number
  /** uncontrolled 初始頁(1-based,預設 1)。 */
  defaultPage?: number
  /** 換頁 callback(1-based)。URL 同步在此接 router,不把按鈕換 <a>。每頁筆數變更時自動回第 1 頁並 fire。 */
  onPageChange?: (page: number) => void
  /** 每頁筆數變更 callback。 */
  onPageSizeChange?: (pageSize: number) => void
  /** 完整形態:左側顯示「第 x–y 筆,共 N 筆」range 資訊(Ant showTotal / MUI / Carbon 同款,opt-in)。 */
  showTotal?: boolean
  /** 完整形態:頁碼右側渲染「N 筆/頁」選單(消費 Select sm;Ant showSizeChanger 同款,opt-in)。 */
  pageSizeOptions?: number[]
  /** 上一頁按鈕 aria-label(iconOnly 必有名)。 */
  prevAriaLabel?: string
  /** 下一頁按鈕 aria-label。 */
  nextAriaLabel?: string
}

/**
 * Pagination —— 大量資料切頁後的位置導覽(數字頁碼派,2026-07-05 user 拍板)。
 *
 * 本元件是分頁的**完整功能 SSOT**(2026-07-06 user 拍板):頁碼 + 總筆數資訊(showTotal)
 * + 每頁筆數選單(pageSizeOptions)全部 own 在此;完整形態 layout =「資訊左、操作右」
 * (Ant 源碼結構同款:total 文字最左、size changer 最右)。DataTable 等 consumer 轉發
 * config 消費本元件,不自拼分頁列。與虛擬滾動互斥。詳 ./pagination.spec.md。
 */
const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      total,
      pageSize: pageSizeProp,
      defaultPageSize = 20,
      page: pageProp,
      defaultPage = 1,
      onPageChange,
      onPageSizeChange,
      showTotal = false,
      pageSizeOptions,
      prevAriaLabel = '上一頁', // i18n-allow: DS default; consumer override via prop(precedent calendar.tsx)
      nextAriaLabel = '下一頁', // i18n-allow: DS default; consumer override via prop
      className,
      ...props
    },
    ref,
  ) => {
    // Hooks 必在 early return 之前(React #310 canonical,select.tsx:503 同慣例)
    const [pageSize, setPageSize] = useControllable<number>({
      value: pageSizeProp,
      defaultValue: defaultPageSize,
      onChange: onPageSizeChange,
    })
    const [page, setPage] = useControllable<number>({
      value: pageProp,
      defaultValue: defaultPage,
      onChange: onPageChange,
    })

    // 階梯量測掛在 nav 自己身上(容器,不是視窗);與 consumer 傳進來的 ref 合流。
    const navRef = React.useRef<HTMLElement | null>(null)
    const setNavRef = React.useCallback((node: HTMLElement | null) => {
      navRef.current = node
      if (typeof ref === 'function') ref(node as HTMLElement)
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node
    }, [ref])
    const tier = useNarrowTier(navRef)

    // 無資料 → 不渲染(空狀態由 Empty / 列表層表達,詳 spec 邊界案例)
    if (total <= 0) return null

    // pageSize <= 0 防禦 clamp(consumer contract violation)——防 totalPages 變 Infinity/NaN
    // 渲染垃圾格位(spec 邊界案例表有對應 row)
    const safePageSize = Math.max(1, Math.floor(pageSize))
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const current = Math.min(Math.max(page, 1), totalPages)
    const hasSizeChangerAtFull = !!pageSizeOptions && pageSizeOptions.length > 0
    // 階梯:0 全開 / 1 收每頁筆數 / 2 格位 7→5 / 3 再收資訊文字
    const hasSizeChanger = hasSizeChangerAtFull && tier < 1
    const showTotalNow = showTotal && tier < 3
    const slots = getPaginationRange(current, totalPages, tier < 2 ? SIBLING_COUNT : SIBLING_COUNT_NARROW)
    const hasExtras = showTotal || hasSizeChangerAtFull
    const rangeStart = (current - 1) * safePageSize + 1
    const rangeEnd = Math.min(current * safePageSize, total)
    // 當前 pageSize 不在 options 內時補進清單頭(否則 Select trigger 顯示裸值失去「N 筆/頁」文案)
    const sizeOptions = hasSizeChanger
      ? (pageSizeOptions!.includes(safePageSize) ? pageSizeOptions! : [safePageSize, ...pageSizeOptions!])
      : []

    const pageList = (
      <ul className="flex items-center gap-1">
        <li>
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={ChevronLeft}
            aria-label={prevAriaLabel}
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          />
        </li>
        {slots.map((slot) =>
          typeof slot === 'number' ? (
            <li key={slot}>
              {/* 當前頁 = <Button variant="secondary"> 一比一零客製(2026-07-06 user 抓出可純組裝):
                  secondary 的 rest(primary 描邊+染字+不染底)/ hover(升 hover 階)/ active(深一階)
                  與 semantic.css「選中」canonical + 拍板 #8 完全同拼寫,且無 neutral 灰底 hover —
                  消費既有 variant 取代手寫平行拼寫(M17/M23 SSOT)。選中「語意」由 aria-current="page"
                  承載,Button 僅為視覺 host;未選 = text variant。className 只剩等寬幾何
                  (蓋掉 size sm 的 min-w-14/px-3,方形 item 對齊 Ant;兩 variant 同 border 寬零位移)。 */}
              <Button
                variant={slot === current ? 'secondary' : 'text'}
                size="sm"
                aria-current={slot === current ? 'page' : undefined}
                className="min-w-[var(--field-height-sm)] px-1 justify-center tabular-nums"
                onClick={() => setPage(slot)}
              >
                {slot}
              </Button>
            </li>
          ) : (
            // Ellipsis 純指示不可點(MUI / shadcn 同;Ant 為可點 jump-5 派,見 spec);寬度對齊數字鈕保持節奏
            <li
              key={slot}
              aria-hidden
              className="flex min-w-[var(--field-height-sm)] items-center justify-center"
            >
              <MoreHorizontal size={16} className="text-fg-muted" />
            </li>
          ),
        )}
        <li>
          <Button
            variant="text"
            size="sm"
            iconOnly
            startIcon={ChevronRight}
            aria-label={nextAriaLabel}
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
          />
        </li>
      </ul>
    )

    return (
      <nav
        ref={setNavRef}
        aria-label="Pagination"
        className={cn(
          // `overflow-x-auto` 是階梯走完之後的最後一道:砍無可砍時整條橫向可捲,
          // 不換行也不截斷(同 `tabs.spec.md` 對「整列放不下」的既有 canonical:走 overflow,
          // 不是截斷單一 item)。**不加 scroll arrow** —— 那組 ChevronLeft/Right 跟分頁自己的
          // 上下頁箭頭長得一模一樣,擺在同一列會分不清「捲動」還是「翻頁」。
          'flex items-center overflow-x-auto',
          // 完整形態 =「資訊左、操作右」(Ant 源碼結構:total 文字最左 li、size changer 最右 li)
          hasExtras && 'w-full justify-between gap-[var(--layout-space-tight)]',
          className,
        )}
        {...props}
      >
        {hasExtras && (
          // i18n-allow: DS default(range 格式 = Ant/MUI/Carbon 共識);showTotal=false 時渲染
          // 空 span 佔 justify-between 左位,不含 stray 文字節點
          // `whitespace-nowrap` + `shrink-0`:資訊文字**永遠不會超過一行**(2026-09-04 user 要求)。
          // 沒有這兩個,flex 會把它壓到剩一個字寬再逐字斷行 —— 實測 440px 容器下分頁列高度
          // 從 28px 爆成 147px。階梯在它需要換行之前就先砍別的,砍到最後是整段拿掉,不會有半行。
          <span className="text-body text-fg-secondary shrink-0 whitespace-nowrap">
            {showTotalNow ? `第 ${rangeStart}–${rangeEnd} 筆,共 ${total} 筆` : null}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-[var(--layout-space-tight)]">
          {pageList}
          {hasSizeChanger && (
            <Select
              size="sm"
              aria-label="每頁筆數" // i18n-allow: DS default
              className="w-28"
              value={String(safePageSize)}
              onChange={(v) => {
                const next = Number(v)
                // 同值重選 / 非法值不動作——防「重選 20 筆/頁」誤把頁碼重置回第 1 頁
                if (!Number.isFinite(next) || next <= 0 || next === safePageSize) return
                setPageSize(next)
                // 換每頁筆數回第 1 頁——MUI TablePagination / TanStack autoResetPageIndex 派;
                // Ant 為 preserve-position(clamp)派,本 DS 採 reset-to-1(spec「完整形態」段有註記)
                setPage(1)
              }}
              options={sizeOptions.map((n) => ({ value: String(n), label: `${n} 筆/頁` }))} // i18n-allow: DS default(Ant「20 / page」內嵌同款)
            />
          )}
        </div>
      </nav>
    )
  },
)
Pagination.displayName = 'Pagination'

export const paginationMeta = {
  component: 'Pagination',
  family: null, // non-family composite(nav 橫排 control row;按鈕消費 Family 3 Button Pill)
  variants: {},
  // 單一尺寸(按鈕固定 Button sm;無 size 軸)—— 頁碼列是 chrome 級導覽不隨 Field 密度縮放,
  // spec「SizeMatrix N/A rationale」段有完整理由
  sizes: {},
  // 'selected' = 當前頁(語意由 aria-current="page" 承載;2026-07-07 meta 詞彙統一:持續選中一律 'selected')
  states: ['default', 'hover', 'active', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    // bg:未選/上下頁(Button text)hover 灰底 + active 深一階;當前頁(secondary)bg-surface
    bg: ['bg-surface', 'bg-neutral-hover', 'bg-neutral-active'],
    fg: ['text-foreground', 'text-primary', 'text-primary-hover', 'text-primary-active', 'text-fg-muted', 'text-fg-secondary', 'text-fg-disabled'],
    border: ['border-primary', 'border-primary-hover', 'border-primary-active'],
    ring: ['ring-ring'],
  },
} as const

export { Pagination }
