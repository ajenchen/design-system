// ────────────────────────────── 消費的 SSOT ──────────────────────────────
// - Button:../Button/button.tsx —— 全部按鈕純 variant 組裝零視覺客製(2026-07-06 user 抓出):
//   上下頁 = text iconOnly / 未選數字 = text / 當前頁 = secondary(rest primary 描邊染字不染底、
//   hover 升 hover 階、active 深一階 —— 與 semantic.css「選中」canonical + 拍板 #8 完全同拼寫);
//   選中「語意」由 aria-current="page" 承載(非 pressed —— pressed 是可取消 toggle,當前頁不可取消)
// - Select(size="sm"):../Select/select.tsx —— 完整形態的「N 筆/頁」選單
// - Ellipsis icon:MoreHorizontal(.claude/rules/ui-development.md「Icon canonical」)
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

type PaginationSlot = number | 'ellipsis-start' | 'ellipsis-end'

// 摺疊演算法照 MUI usePagination(1/1 配置);兩顆 ellipsis 用 distinct 穩定 key
// (Breadcrumb Math.random key remount 前車之鑑,breadcrumb.tsx:208-210)。
function getPaginationRange(page: number, totalPages: number): PaginationSlot[] {
  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i)

  // 全部放得下(≤ 7 頁)→ 不摺疊
  if (totalPages <= BOUNDARY_COUNT * 2 + SIBLING_COUNT * 2 + 3) return range(1, totalPages)

  const startPages = range(1, BOUNDARY_COUNT)
  const endPages = range(totalPages - BOUNDARY_COUNT + 1, totalPages)
  const siblingsStart = Math.max(
    Math.min(page - SIBLING_COUNT, totalPages - BOUNDARY_COUNT - SIBLING_COUNT * 2 - 1),
    BOUNDARY_COUNT + 2,
  )
  const siblingsEnd = Math.min(
    Math.max(page + SIBLING_COUNT, BOUNDARY_COUNT + SIBLING_COUNT * 2 + 2),
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

    // 無資料 → 不渲染(空狀態由 Empty / 列表層表達,詳 spec 邊界案例)
    if (total <= 0) return null

    // pageSize <= 0 防禦 clamp(consumer contract violation)——防 totalPages 變 Infinity/NaN
    // 渲染垃圾格位(spec 邊界案例表有對應 row)
    const safePageSize = Math.max(1, Math.floor(pageSize))
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const current = Math.min(Math.max(page, 1), totalPages)
    const slots = getPaginationRange(current, totalPages)
    const hasSizeChanger = !!pageSizeOptions && pageSizeOptions.length > 0
    const hasExtras = showTotal || hasSizeChanger
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
        ref={ref}
        aria-label="Pagination"
        className={cn(
          'flex items-center',
          // 完整形態 =「資訊左、操作右」(Ant 源碼結構:total 文字最左 li、size changer 最右 li)
          hasExtras && 'w-full justify-between gap-[var(--layout-space-tight)]',
          className,
        )}
        {...props}
      >
        {hasExtras && (
          // i18n-allow: DS default(range 格式 = Ant/MUI/Carbon 共識);showTotal=false 時渲染
          // 空 span 佔 justify-between 左位,不含 stray 文字節點
          <span className="text-body text-fg-secondary">
            {showTotal ? `第 ${rangeStart}–${rangeEnd} 筆,共 ${total} 筆` : null}
          </span>
        )}
        <div className="flex items-center gap-[var(--layout-space-tight)]">
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
