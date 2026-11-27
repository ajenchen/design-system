// @internal — Calendar 內部的「+N」按鈕與當天清單浮層(calendar.spec.md「每格筆數與「+N」」「「+N」清單浮層」);不從 index 匯出
// (scripts/gen-component-indexes.mjs findFeatureSiblings:檔頭 10 行含 @internal 的 `calendar-*.tsx` 不 re-export)。只給 calendar.tsx 用。
import * as React from 'react'
import { Popover, PopoverAnchor, PopoverBody, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/design-system/components/Popover/popover'
import { halfRowCap, OVERLAY_LIST_ROWS } from '@/design-system/tokens/elevation/overlay-geometry'
import { CALENDAR_GEOMETRY_STYLE } from './calendar-geometry'

/**
 * ── 消費的 SSOT ──
 * - components: [Popover(PopoverTrigger / PopoverAnchor virtualRef / PopoverContent coverAnchor + maxHeight / PopoverHeader closeAriaLabel / PopoverTitle / PopoverBody)]
 * - tokens: [--tag-height-md(「+N」高、清單列高), --neutral-hover(「+N」滑過,透明底的配對), --fg-secondary(「+N」字色),
 *   --layout-space-tight(標題列上下內距、清單底部 12 由 hug 規則給), --font-body-size(標題列行高 = 字級 × 1.5)]
 * - 幾何: ./calendar-geometry.ts(列距 / 文字內距 --calendar-gap / --calendar-text-inset;浮層畫在 Calendar 根節點外,變數要另設一次);
 *   tokens/elevation/overlay-geometry.ts `halfRowCap`(半列原則)、PopoverContent `maxHeight` 經 `capHeight`(只能往更矮調)
 * - spec refs: calendar.spec.md「每格筆數與「+N」」「「+N」清單浮層」(內容 / 外殼 / 位置 / 標題列與內距 / 列距 / 高度與捲動 / 鍵盤與焦點)、
 *   popover.spec.md「蓋在錨點上(展開型)」、overlay-surface.spec.md「Viewport-aware scroll chain invariant」、layoutSpace.spec.md 規則 4(hug 容器底 = 頂)、
 *   agent-decision-card.spec.md:10-11(標題列下不畫分隔線、body 頂部 0 的先例,agent-panel.tsx `border-b-0`)
 */

/**
 * 清單預設完整看得到幾列(半列原則的 N;上限 = 標題列 + N 列 + 半列)—— 直接讀 DS 清單型浮層單行列的同一個 N(overlay-geometry.ts `OVERLAY_LIST_ROWS.single` = 9,
 * 由來:最接近改前寫死的 300px),不另抄一份數字【MORE-CAP(定)】:user 2026-11-26 決策卡 more-cap 點選「維持 9 列」。
 * 列高 24 + 列距 4 時一般密度上限 = 框 2 + 標題列 45 + 9 × 28 + 12 = 311px(瀏覽器實量見 calendar-month ML-half);世界級對照與來源只住 calendar.spec.md「「+N」清單浮層」高度與捲動。
 */
export const CALENDAR_MORE_LIST_ROWS = OVERLAY_LIST_ROWS.single

/**
 * 清單上限裡、第一列上方的固定高 = PopoverContent 上下框 + 標題列。
 * - 標題列 = 標題行高(`--font-body-size` × 1.5,同 overlay-surface.tsx `COMPACT_HEADER_SLOT`)+ 上下 `--layout-space-tight`(PopoverContent 鎖一般密度的版面間距,
 *   popover.tsx `data-layout-space="md"`)—— popover.tsx PopoverHeader 註解「21 + 12×2 = 45」;
 * - 框:PopoverContent 是 border-box、`border` 上下各 1(Tailwind `border` 預設寬,popover.tsx 外殼),maxHeight 量的是含框的外框。
 * body 頂部 0(標題列底下不畫分隔線、body 不給上內距):第一列緊接標題列。畫面上「最後一列切在半列」由 scripts/overlay-height-cap-invariant.mjs 實量。
 */
const LIST_BEFORE_FIRST_ROW = 'calc(var(--font-body-size) * 1.5 + 2 * var(--layout-space-tight) + 2px)'

/** 清單的高度上限預設(半列原則;列高 = 事件列 Tag md、列距 = 格內列距,兩者讀同一組變數) */
const CALENDAR_MORE_LIST_MAX_HEIGHT = halfRowCap({
  rows: CALENDAR_MORE_LIST_ROWS,
  rowHeight: 'var(--tag-height-md)',
  gap: 'var(--calendar-gap)',
  before: LIST_BEFORE_FIRST_ROW,
})

interface CalendarMoreListProps {
  /** 這一天(yyyy-MM-dd)。「+N」帶 `data-calendar-more={day}`:格內導覽依日子找到它(排在這一天的事件之後) */
  day: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 「+N」那一列:文字、讀屏名稱、第幾列(第 k 列)。null = 這一格現在放得下(清單開著時格子變高,k 重算後不再溢出)——
   * 「+N」不畫,但清單留著直到使用者關掉(Popover 根不跟著「+N」卸載;關閉時焦點改回這一天的日期停靠點)。
   */
  trigger: { text: string; name: string; gridRow: number } | null
  /** 清單標題(Intl `{ month: 'long', day: 'numeric', weekday: 'short' }`,zh-TW「7月15日 週三」;月日與星期之間有沒有空白隨 ICU 版本變) */
  title: string
  /** × 的讀屏名稱(Calendar `labels.moreListClose`) */
  closeLabel: string
  /** 量到的格寬(浮層寬 = max(格寬, Popover 預設寬));還沒量到 = null */
  cellWidth: number | null
  /** Calendar `moreListMaxHeight`:只能往更矮調(PopoverContent `maxHeight` → capHeight) */
  maxHeight?: number | string
  /** 「+N」不在時,關閉後焦點去的地方(這一天的日期停靠點) */
  fallbackFocus: () => HTMLElement | null
  /** 清單的列(每列一個 listitem;只在開著時呼叫) */
  renderRows: () => React.ReactNode
}

export function CalendarMoreList({ day, open, onOpenChange, trigger, title, closeLabel, cellWidth, maxHeight, fallbackFocus, renderRows }: CalendarMoreListProps) {
  // 錨點 = 「+N」所在的那一格(不是「+N」那顆鈕;calendar.spec.md「位置 = 展開型」)。「+N」卸載後格子還在,留著上一次的格子。
  const cellRef = React.useRef<HTMLElement | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const setTrigger = React.useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node
    const cell = node?.closest<HTMLElement>('[role="gridcell"]')
    if (cell) cellRef.current = cell
  }, [])
  // 點外面關掉時焦點留在點的地方(keyboard-model-canonical.md「關了之後焦點去哪」):只有「+N」已經不在、而且不是點外面關的,才改回日期停靠點
  const interactedOutside = React.useRef(false)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <PopoverTrigger asChild>
          {/* 「+N」= 原生 <button>(calendar.spec.md「每格筆數與「+N」」「+N」那一列):佔第 k 列、與事件列同高(h-tag-md)、左右內距 8(--calendar-text-inset)、
              rounded-md、靜止透明、滑過 --neutral-hover(透明底的配對,color.spec.md「Hover 換色配對總則」;瞬間切換)、手形、字色 text-fg-secondary、
              字級同事件列 text-body【C3、C6;內距、字色、字級為 AI 推導】。aria-haspopup / aria-expanded 由 Radix Trigger 給。
              tabIndex -1:格陣只有一個 Tab 停靠點(同事件方塊),經格內導覽(F2 → 方向鍵)走到,排在這一天的事件之後。
              焦點框往外(不寫 class,走全域 :focus-visible):上方列距 4、下方格子內距 4、左右格子內距 4 → 四周最小淨空 4(calendar.spec.md「焦點框」)。 */}
          <button
            ref={setTrigger}
            type="button"
            tabIndex={-1}
            data-calendar-more={day}
            aria-label={trigger.name}
            style={{ gridRow: trigger.gridRow }}
            onClick={(e) => {
              // 點「+N」不會變成在這天新增(阻止冒泡到格子的 onDateClick;calendar.spec.md「命中區」)。Radix 的開關照樣執行(它只看 defaultPrevented)。
              e.stopPropagation()
            }}
            className="flex items-center w-full h-tag-md px-[var(--calendar-text-inset)] rounded-md text-body text-start text-fg-secondary whitespace-nowrap overflow-hidden cursor-pointer hover:bg-neutral-hover"
          >
            {trigger.text}
          </button>
        </PopoverTrigger>
      )}
      <PopoverAnchor virtualRef={cellRef as React.RefObject<HTMLElement>} />
      <PopoverContent
        data-calendar-more-list={day}
        // 展開型:中心 = 格子中心、碰視窗邊推回 8;不傳 side / align / sideOffset(popover.spec.md「蓋在錨點上(展開型)」)
        coverAnchor
        maxHeight={maxHeight ?? CALENDAR_MORE_LIST_MAX_HEIGHT}
        // 浮層畫在 Calendar 根節點外(Portal),列與列距讀的 --calendar-* 要在這裡再設一次;寬 = max(格寬, 預設 w-72)【寬的取法 AI 推導】
        style={{ ...CALENDAR_GEOMETRY_STYLE, minWidth: cellWidth ?? undefined }}
        onInteractOutside={(e) => { if (!e.defaultPrevented) interactedOutside.current = true }}
        onCloseAutoFocus={(e) => {
          const outside = interactedOutside.current
          interactedOutside.current = false
          if (triggerRef.current?.isConnected) return
          e.preventDefault()
          if (!outside) fallbackFocus()?.focus()
        }}
      >
        {/* 標題列 = 標準 PopoverHeader(內建 ×);底下不畫分隔線、body 頂部 0 —— 標題到頂部 12 = 標題到第一筆 12,只由標題列的下內距給
            【Q4(定)、總帳更正 #1;先例 agent-panel.tsx 決策卡 border-b-0】 */}
        <PopoverHeader className="border-b-0" closeAriaLabel={closeLabel}>
          <PopoverTitle>{title}</PopoverTitle>
        </PopoverHeader>
        {/* 左右 16 = SurfaceBody 預設;底 12 = hug 容器底 = 頂(layoutSpace.css data-layout-body="hug");頂 0 */}
        <PopoverBody className="pt-0">
          {/* 列距 4 = 格內列距(--calendar-gap)【Q4b(定):韻律規則的例外,只住 calendar.spec.md】 */}
          <div role="list" className="flex flex-col gap-[var(--calendar-gap)]">
            {open ? renderRows() : null}
          </div>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  )
}
