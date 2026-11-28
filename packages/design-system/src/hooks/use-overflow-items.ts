import * as React from 'react'
import { flushSync } from 'react-dom'

/**
 * 水平溢出追蹤 hooks — 給 Tabs / ChipGroup 等「一排水平 items 塞不下父容器」的元件共用。
 *
 * ── 設計原則 ──
 *   Scroll 模式與 Menu 模式是兩種處理策略：
 *
 *   1. **Scroll 模式**（Material / Polaris / Primer / iOS 作法）
 *      items 用原生 overflow-x-auto 水平滾動，邊緣 fade mask 指示還有內容。
 *      使用 `useScrollEdges()`：回傳 atStart / atEnd / canScroll，讓消費端
 *      決定 mask-image / scroll arrow 的顯示。
 *
 *   2. **Menu 模式**（Ant Design / Atlassian「動態 collapse-overflow」作法）
 *      塞不下的 items 收進 DropdownMenu。兩種用法、兩支 hook:
 *      - **捲動容器**:`useOverflowIndices()` —— 容器可以捲動(overflow-x-auto),回傳「此刻捲動位置看不到的」items;
 *      - **收合**:`useOverflowCollapse()`(2026-11-27,workspace H31)—— 容器不捲動,量容器寬與每一項的寬,
 *        依呼叫端給的優先順序把放不下的收進觸發鈕(工具列的末端溢出 / 群組溢出,`patterns/action-bar/action-bar.spec.md`
 *        第六、七節);**全部放得下時不扣觸發鈕寬、不出觸發鈕**,只有真的放不下才替它留位。
 *
 *      ⚠️ **`useOverflowIndices` 目前 0 consumer（reserved primitive）**：DS 內現有 menu 模式實作（Tabs / Chip）走的是
 *      「**show-all navigator**」派 — dropdown 永遠列**全部** items（不需動態 overflow 計算），**刻意不用**
 *      `useOverflowIndices`（見 tabs.tsx `MenuTabsList` / chip.tsx `MenuChipGroup` 註解）；選中項置中由
 *      horizontal-overflow 的 `useRevealSelected` 負責（2026-11-11 前各自用 local registerItem + scrollIntoView）。
 *      本 hook 保留給未來真正需要「collapse-overflow：只把塞不下的收進選單」的 consumer。
 *      **roving tabindex / a11y 語意由 consumer 的渲染方式決定**（hook 只回傳 indices，不操作
 *      DOM / tabindex），非 hook 本身保證。
 *
 * ── 為什麼分兩個 hook，不合一 ──
 *   Scroll 的計算依據是 scroll 事件與 client/scroll width；Menu 的計算依據是
 *   items 的 offsetLeft/offsetWidth 相對容器 clientWidth。訂閱的事件不同
 *   （scroll vs resize），回傳的資料形狀不同。合一會讓 API 有一半是 noise。
 *   收合(`useOverflowCollapse`)與捲動容器(`useOverflowIndices`)也分開,理由相同:收合不看捲動位置、要優先順序與
 *   觸發鈕 / 分隔線的註冊,捲動容器都不需要。
 */

// ─────────────────────────────────────────────────────────────────────────────
// useScrollEdges — 給 scroll 模式
// ─────────────────────────────────────────────────────────────────────────────

// code-quality-allow: dead-export — hook return type — API surface for consumers who want to annotate
export interface UseScrollEdgesResult<T extends HTMLElement> {
  /** 綁在 scroll container 上的 ref */
  scrollRef: React.RefObject<T>
  /** scroll 位置在最左側（無法再往左）*/
  atStart: boolean
  /** scroll 位置在最右側（無法再往右）*/
  atEnd: boolean
  /** 內容總寬度超過可視寬度，有滾動空間 */
  canScroll: boolean
}

/**
 * 追蹤 scroll container 的滾動位置，用來決定左右 fade mask 是否顯示。
 *
 * 典型用法：
 * ```tsx
 * const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
 * const maskImage = canScroll
 *   ? `linear-gradient(to right,
 *       ${atStart ? 'black' : 'transparent'} 0,
 *       black 16px,
 *       black calc(100% - 16px),
 *       ${atEnd ? 'black' : 'transparent'} 100%)`
 *   : undefined
 * return <div ref={scrollRef} className="overflow-x-auto" style={{ maskImage, WebkitMaskImage: maskImage }}>
 *   {items}
 * </div>
 * ```
 */
export function useScrollEdges<T extends HTMLElement = HTMLElement>(): UseScrollEdgesResult<T> {
  const scrollRef = React.useRef<T | null>(null)
  const [state, setState] = React.useState({ atStart: true, atEnd: true, canScroll: false })

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const canScroll = el.scrollWidth > el.clientWidth + 1
      const atStart = el.scrollLeft <= 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      setState((prev) =>
        prev.atStart === atStart && prev.atEnd === atEnd && prev.canScroll === canScroll
          ? prev
          : { atStart, atEnd, canScroll }
      )
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // 監聽 children 變化（items 增減、字體載入）
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    // 標記捲動容器(2026-09-29,待辦總帳 OE26):OverflowScrollArrow 卸載時若焦點在它身上、另一側箭頭也不在,
    // 就把焦點交給這個容器 —— 靠這個屬性找到它,消費者不用多傳 ref。
    el.setAttribute('data-overflow-scroller', '')

    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
      el.removeAttribute('data-overflow-scroller')
    }
  }, [])

  return { scrollRef, ...state }
}

// ─────────────────────────────────────────────────────────────────────────────
// useOverflowIndices — 給 menu 模式
// ─────────────────────────────────────────────────────────────────────────────

export interface UseOverflowIndicesOptions {
  /**
   * 預留給 overflow trigger（如 "More" 按鈕）的右側寬度（px）。
   * 計算 items 是否溢出時會從 container clientWidth 扣掉這個值 —— **只在內容真的超出容器時才扣**:
   * 全部放得下(容器沒有可捲的內容)就不替觸發鈕留位(2026-11-27 H31,與 `useOverflowCollapse`、OverflowTagList 同一條;
   * 修前永遠扣,最後一兩顆明明放得下也被算成溢出 —— AgentPanel 附件列 2026-10-13 前就是這樣把放得下的最後一顆收進「+1」)。
   */
  reserveTriggerWidth?: number
}

// code-quality-allow: dead-export — hook return type — API surface for consumers who want to annotate
export interface UseOverflowIndicesResult<C extends HTMLElement> {
  /** 綁在 items 的父容器上 */
  containerRef: React.RefObject<C>
  /** 為每個 item 註冊 ref（回傳 callback ref）*/
  registerItem: (index: number) => (el: HTMLElement | null) => void
  /** DOM 順序上溢出的 item 索引（連續區間，從某個 index 到尾端）*/
  overflowIndices: number[]
  /** 至少有一個 item 溢出 */
  hasOverflow: boolean
  /** 依 index 取得對應 item 的 DOM 元素，供 scrollIntoView 等操作使用 */
  getItemAt: (index: number) => HTMLElement | undefined
}

/**
 * 追蹤一排水平 items 裡哪些「當前不在可視範圍內」。
 *
 * ── 演算法 ──
 *   對每個 item 檢查 `[offsetLeft, offsetLeft+offsetWidth]` 是否完全落在
 *   `[scrollLeft, scrollLeft + clientWidth - reserveTriggerWidth]` 範圍內。
 *   沒完全落在內的就算溢出。內容沒有超出容器(`scrollWidth ≤ clientWidth`)時不扣 reserveTriggerWidth —— 全部放得下就沒有溢出。
 *
 *   **關鍵**：overflow 集合跟 scrollLeft 連動,不是靜態「原始佈局不 fit」集合。
 *   這是 Ant Design / Atlassian 世界級作法 —— menu 顯示「當下看不到的 items」,
 *   不是「原始溢出的 items」。
 *
 *   為什麼這樣對:
 *   - 使用者點 menu item → `scrollIntoView` → 原本 overflow 的 item 進入視圖,
 *     原本可見的 items 被推出去 → 下次開 menu 看到的是「剛被推出去的 items」,
 *     永遠能找到所有當前看不到的 items,不會卡住。
 *   - 靜態 overflow (只算原始佈局) 會造成 scroll 後無法回到前面的 items。
 *
 * ── 觸發重算 ──
 *   - ResizeObserver: 容器寬度變化 / item 尺寸變化
 *   - scroll event: scroll 位置變化
 *
 * ── 前提 ──
 *   items 在 DOM 裡始終存在 (不可 conditional render),並用 `registerItem(i)` 綁 ref。
 *   容器要可以 scroll (overflow-x-auto 或類似),否則 scrollLeft 永遠 0。
 *   **不捲動的工具列**(放不下就收進「…」、放得下就全部攤開)用下方的 `useOverflowCollapse`,不是這支。
 *
 * 典型用法:
 * ```tsx
 * const { containerRef, registerItem, overflowIndices, hasOverflow, getItemAt } =
 *   useOverflowIndices<HTMLDivElement>({ reserveTriggerWidth: 0 })
 *
 * // 選中項置中不在這裡寫:同一個捲動容器掛 horizontal-overflow 的 useRevealSelected(看選中屬性,
 * // 點擊 / 鍵盤 / 選單同一條;horizontal-overflow.spec.md「選到就露出來」)
 * const handleMenuSelect = (value: string) => onValueChange?.(value)
 *
 * return (
 *   <div className="flex items-center">
 *     <div ref={containerRef} className="flex-1 min-w-0 overflow-x-auto">
 *       <ItemList>
 *         {items.map((item, i) => React.cloneElement(item, { ref: registerItem(i) }))}
 *       </ItemList>
 *     </div>
 *     {hasOverflow && <OverflowMenu items={overflowIndices.map(i => items[i])} />}
 *   </div>
 * )
 * ```
 */
export function useOverflowIndices<C extends HTMLElement = HTMLElement>(
  options: UseOverflowIndicesOptions = {}
): UseOverflowIndicesResult<C> {
  const { reserveTriggerWidth = 0 } = options
  const containerRef = React.useRef<C | null>(null)
  const itemRefsMap = React.useRef<Map<number, HTMLElement>>(new Map())
  const [overflowIndices, setOverflowIndices] = React.useState<number[]>([])

  const registerItem = React.useCallback((index: number) => {
    return (el: HTMLElement | null) => {
      if (el) {
        itemRefsMap.current.set(index, el)
      } else {
        itemRefsMap.current.delete(index)
      }
    }
  }, [])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const compute = () => {
      const containerWidth = container.clientWidth
      if (containerWidth === 0) return

      // 容許 1px 的像素取整誤差,避免邊界 item 被誤判為 overflow
      const tolerance = 1

      const scrollLeft = container.scrollLeft
      const visibleStart = scrollLeft
      // 全部放得下就不替觸發鈕留位(見 reserveTriggerWidth):內容沒有超出容器 = 沒有東西要收
      const allFit = container.scrollWidth <= containerWidth + tolerance
      const visibleEnd = scrollLeft + containerWidth - (allFit ? 0 : reserveTriggerWidth)

      const indices = Array.from(itemRefsMap.current.keys()).sort((a, b) => a - b)

      const overflow: number[] = []
      for (const i of indices) {
        const el = itemRefsMap.current.get(i)
        if (!el) continue

        const left = el.offsetLeft
        const right = left + el.offsetWidth
        // 完全可見條件: item 的左右邊都在可視窗口內
        const fullyVisible =
          left >= visibleStart - tolerance && right <= visibleEnd + tolerance
        if (!fullyVisible) overflow.push(i)
      }

      setOverflowIndices((prev) => {
        if (prev.length === overflow.length && prev.every((v, i) => v === overflow[i])) {
          return prev
        }
        return overflow
      })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(container)
    // 也觀察每個 item 的尺寸變化（字體載入、label 更新等）
    itemRefsMap.current.forEach((el) => ro.observe(el))
    // Scroll event: overflow 集合隨 scroll 位置變化
    container.addEventListener('scroll', compute, { passive: true })

    return () => {
      ro.disconnect()
      container.removeEventListener('scroll', compute)
    }
  }, [reserveTriggerWidth])

  const getItemAt = React.useCallback(
    (index: number) => itemRefsMap.current.get(index),
    []
  )

  return {
    containerRef,
    registerItem,
    overflowIndices,
    hasOverflow: overflowIndices.length > 0,
    getItemAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 收合的決定 —— useOverflowCollapse 與 OverflowTagList 共用的唯一一份
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @internal 寬度比較的容差(px):量測值是 1/64px 的倍數,這個容差只吃浮點誤差,不吃任何真的版面差。
 * `useOverflowCollapse` 與 `components/OverflowIndicator/overflow-tag-list.tsx`(`useOverflowCount`)共用。
 */
export const FIT_EPSILON_PX = 0.01

/**
 * @internal 收起幾個:依收起順序,前 k 個收進觸發鈕(2026-11-27 H31 由 OverflowTagList 的決定抽出,M17 —— 全 DS 一份)。
 *
 * 兩段(與 rc-overflow「最後兩顆放得下就不留『+N』的位」同一條,出處見 `components/Combobox/combobox.spec.md`「單行溢出」):
 * ① **全部攤開、不留觸發鈕**:`contentWidth(0)` 放得下 → 0。全部放得下就不替觸發鈕留位、也不出觸發鈕。
 * ② 放不下:k = 1, 2, … 依序試,每個候選都把「收起前 k 個時會出現的觸發鈕」的寬算進去(`triggerWidth(k)`,含它的間距),
 *    取第一個放得下的 k;一個都放不下 → 全部收起(`count`)。
 * 內容寬已經放不下的候選不呼叫 `triggerWidth`(呼叫端量觸發鈕可能要強制版面 —— OverflowTagList 每個數字的「+N」寬不同,
 * 只在邊界附近量一兩個)。
 */
export function decideCollapsedCount(input: {
  /** 可收起的項目數 */
  count: number
  /** 可用寬(小數 px,與項目寬同一種單位) */
  available: number
  /** 收起前 k 個時,看得見的內容佔多寬(不含觸發鈕);k = 0 = 全部攤開 */
  contentWidth: (k: number) => number
  /** 收起前 k 個時,觸發鈕要多佔的寬(含它的間距);只在 k ≥ 1 時呼叫 */
  triggerWidth: (k: number) => number
}): number {
  const limit = input.available + FIT_EPSILON_PX
  const fits = (k: number): boolean => {
    const content = input.contentWidth(k)
    if (content > limit) return false
    return k === 0 || content + input.triggerWidth(k) <= limit
  }
  if (fits(0)) return 0
  for (let k = 1; k < input.count; k++) if (fits(k)) return k
  return input.count
}

// ─────────────────────────────────────────────────────────────────────────────
// useOverflowCollapse — 給不捲動的工具列(末端溢出 / 群組溢出)
// ─────────────────────────────────────────────────────────────────────────────

/** 不給 `group` 的項目、不帶參數的 `registerTrigger()` 用的群組 */
const DEFAULT_OVERFLOW_GROUP = ''

export interface OverflowCollapseItemOptions {
  /**
   * 收起的先後:**數字越大越晚收**(與 Fluent UI `OverflowItem` 的 `priority` 同義:「A higher priority means the item overflows later.」,
   * https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-overflow/library/src/components/OverflowItem/OverflowItem.types.ts);
   * 預設 0。同值時索引大的(排在後面的)先收。誰先收由產品決定(action-bar.spec.md 第七節「搜尋框」表,user 2026-11-26 C30)。
   */
  priority?: number
  /**
   * 收進哪一組的觸發鈕(群組溢出:各群組各自管理,action-bar.spec.md 第六節)。不給 = 預設群組(末端溢出:整排一個觸發鈕)。
   * 該組沒有用 `registerTrigger(group)` 註冊觸發鈕 = 收起時整個隱藏、不出觸發鈕(第七節「群組溢出的操作列」第 3 條:單一按鈕的群組)。
   */
  group?: string
}

// code-quality-allow: dead-export — hook return type — API surface for consumers who want to annotate(2026-11-27 H31,見 action-bar.spec.md「量法」)
export interface UseOverflowCollapseResult<C extends HTMLElement> {
  /** 綁在工具列本身(項目、觸發鈕、分隔線的父元素);它的寬**不能由內容決定**(例如 `flex-1 min-w-0` 或 `w-full`) */
  containerRef: React.RefObject<C>
  /** 為每個可收起的項目註冊(回傳 callback ref);`index` = 呼叫端自己的索引(回傳的 overflowIndices 用它) */
  registerItem: (index: number, options?: OverflowCollapseItemOptions) => (el: HTMLElement | null) => void
  /** 註冊某一組的觸發鈕(不帶參數 = 預設群組)。觸發鈕**一律渲染**,看不看得見由 hook 寫在它的 `hidden` 上 */
  registerTrigger: (group?: string) => (el: HTMLElement | null) => void
  /** 註冊某一組旁邊的分隔線:該組**沒有觸發鈕**而且項目全部收起時,hook 連它一起隱藏(不留孤立的線,action-bar.spec.md 第五節) */
  registerDivider: (group: string) => (el: HTMLElement | null) => void
  /** 收起的項目索引(由小到大) */
  overflowIndices: number[]
  /** 至少收起一項 */
  hasOverflow: boolean
  /** 某一組收起的項目索引(由小到大;不帶參數 = 預設群組)—— 觸發鈕的選單列這些 */
  overflowIndicesOf: (group?: string) => number[]
}

interface CollapseItemRecord { el: HTMLElement; priority: number; group: string }
interface CollapseDecision { indices: number[]; groupOf: Map<number, string> }

const EMPTY_COLLAPSE: CollapseDecision = { indices: [], groupOf: new Map() }

/** 元素連左右外距的寬(小數 px):分隔線兩端的 4px 是外距(`ButtonDivider` `mx-1`) */
function outerInlineSize(el: Element): number {
  const cs = getComputedStyle(el)
  return el.getBoundingClientRect().width + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0)
}

/** 容器的內容寬(小數 px):外框寬扣掉左右內距與邊框 */
function contentInlineSize(el: Element): number {
  const cs = getComputedStyle(el)
  return el.getBoundingClientRect().width
    - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)
}

/**
 * 不捲動的工具列:量容器寬與每一項的寬,**依呼叫端給的優先順序**把放不下的收進觸發鈕;**全部放得下時不扣觸發鈕寬、不出觸發鈕**。
 * 規則 `patterns/action-bar/action-bar.spec.md` 第六節(末端溢出 / 群組溢出)與第七節(空間不足時的降級);2026-11-27 workspace H31。
 *
 * ── 兩種用法 ──
 *   - **末端溢出**(一個觸發鈕在最右):項目不給 `group`,`registerTrigger()` 綁那一顆「…」。
 *   - **群組溢出**(各群組各自的觸發鈕,如富文字工具列的格式 / 插入 / 段落):項目給 `group`,每組 `registerTrigger(group)`;
 *     只有收了東西的那一組會出觸發鈕,也只替那一組留位。單一按鈕的群組不註冊觸發鈕 —— 收起時整個隱藏,
 *     它旁邊的分隔線用 `registerDivider(group)` 交給 hook 一起藏。
 *   (捲動容器裡「此刻看不到的」收進選單是另一回事,用上方 `useOverflowIndices`。)
 *
 * ── 量法(與 OverflowTagList 同一套,決定是同一支 `decideCollapsedCount`)──
 *   ① **攤開**:每一項都顯示、觸發鈕轉成量尺(絕對定位、看不見、不佔位)、分隔線都顯示 —— 量到的寬與上一次決定無關。
 *   ② **量**(一次讀版面):容器內容寬;同一排每個子項連外距的寬 + 欄距(全部攤開時的總寬);每一項、每顆觸發鈕、每條分隔線各自的寬。
 *   ③ **決定**:全部攤開放得下 → 不收、不出觸發鈕;否則依收起順序一個一個收,每個候選都把「那時會出現的觸發鈕」算進去,取第一個放得下的。
 *   ④ **寫回**:收起的項目、不需要的觸發鈕、孤立的分隔線直接寫 `hidden`(與 setState 同一個工作,畫面更新前定案,
 *     不會有一格畫面是「項目收了、選單還沒列」)。掛載與註冊有變時在 layout effect 裡做;之後由 ResizeObserver
 *     (容器、每一項、觸發鈕、分隔線的寬變了)觸發,回呼在下一格畫面之前跑,以 `flushSync` 同步提交。
 *
 * ── 前提 ──
 *   - 項目、觸發鈕、分隔線都是容器的**直接子項**,同一排 flex、間距用 `gap`(`ButtonGroup` 就是)。中間不得夾 `display: contents` 的包裝。
 *   - 容器的寬**不由內容決定**(`flex-1 min-w-0`、`w-full`…);依內容寬的容器攤開就變寬,永遠「放得下」。
 *   - 項目與觸發鈕一律渲染、不要自己條件渲染;hook 會把它們設成不可壓縮(`flex-shrink: 0`,第七節「操作群不可壓縮」),
 *     看不看得見寫在 `hidden` 上(`display: none`:不佔位、不在 Tab 路上、讀屏略過)。收起的項目由呼叫端放進觸發鈕的選單。
 *
 * 典型用法(群組溢出):
 * ```tsx
 * const { containerRef, registerItem, registerTrigger, overflowIndicesOf } = useOverflowCollapse<HTMLDivElement>()
 * return (
 *   <ButtonGroup ref={containerRef} className="flex-1 min-w-0">
 *     {formatActions.map((a, i) => <Button key={a.id} ref={registerItem(i, { group: 'format', priority: a.priority })} … />)}
 *     <OverflowMenu items={overflowIndicesOf('format').map((i) => formatActions[i])}>
 *       <Button ref={registerTrigger('format')} variant="text" size="sm" iconOnly startIcon={ChevronDown} aria-label="更多格式" />
 *     </OverflowMenu>
 *     <ButtonDivider />
 *     …
 *   </ButtonGroup>
 * )
 * ```
 */
export function useOverflowCollapse<C extends HTMLElement = HTMLElement>(): UseOverflowCollapseResult<C> {
  const containerRef = React.useRef<C | null>(null)
  const items = React.useRef(new Map<number, CollapseItemRecord>())
  const triggers = React.useRef(new Map<string, HTMLElement>())
  const dividers = React.useRef(new Map<string, HTMLElement>())
  const refCache = React.useRef(new Map<string, (el: HTMLElement | null) => void>())
  const observer = React.useRef<ResizeObserver | null>(null)
  /** 這次決定用過的寬(ResizeObserver 拿來比:一樣就不重算) */
  const used = React.useRef<{ contentW: number; widths: Map<Element, number> } | null>(null)
  /** 註冊有變(新項目、換優先順序、換群組、卸載)就加一:layout effect 只在它變了時重量 */
  const version = React.useRef(0)
  const decidedVersion = React.useRef(-1)
  const [decision, setDecision] = React.useState<CollapseDecision>(EMPTY_COLLAPSE)
  const decisionRef = React.useRef<CollapseDecision>(EMPTY_COLLAPSE)

  const track = React.useCallback((el: HTMLElement) => {
    el.style.flexShrink = '0'
    observer.current?.observe(el, { box: 'border-box' })
  }, [])
  const untrack = React.useCallback((el: HTMLElement) => { observer.current?.unobserve(el) }, [])

  const cached = (key: string, make: () => (el: HTMLElement | null) => void) => {
    let ref = refCache.current.get(key)
    if (!ref) { ref = make(); refCache.current.set(key, ref) }
    return ref
  }

  const registerItem = (index: number, options: OverflowCollapseItemOptions = {}) => {
    const priority = options.priority ?? 0
    const group = options.group ?? DEFAULT_OVERFLOW_GROUP
    return cached(`item\u0000${index}\u0000${priority}\u0000${group}`, () => (el) => {
      version.current++
      const prev = items.current.get(index)
      if (el) {
        if (prev && prev.el !== el) untrack(prev.el)
        items.current.set(index, { el, priority, group })
        track(el)
      } else if (prev && prev.priority === priority && prev.group === group) {
        items.current.delete(index)
        untrack(prev.el)
      }
    })
  }
  const registerSingle = (map: { current: Map<string, HTMLElement> }, kind: string, group: string) =>
    cached(`${kind}\u0000${group}`, () => (el) => {
      version.current++
      const prev = map.current.get(group)
      if (prev && prev !== el) untrack(prev)
      if (el) { map.current.set(group, el); track(el) } else map.current.delete(group)
    })
  const registerTrigger = (group: string = DEFAULT_OVERFLOW_GROUP) => registerSingle(triggers, 'trigger', group)
  const registerDivider = (group: string) => registerSingle(dividers, 'divider', group)

  /** 照一個決定寫回 DOM(收起的項目 / 不需要的觸發鈕 / 孤立的分隔線 → hidden) */
  const apply = React.useCallback((collapsed: Set<number>) => {
    const collapsedIn = new Map<string, number>()
    const sizeOf = new Map<string, number>()
    for (const [i, r] of items.current) {
      r.el.hidden = collapsed.has(i)
      sizeOf.set(r.group, (sizeOf.get(r.group) ?? 0) + 1)
      if (collapsed.has(i)) collapsedIn.set(r.group, (collapsedIn.get(r.group) ?? 0) + 1)
    }
    for (const [g, el] of triggers.current) el.hidden = !collapsedIn.get(g)
    for (const [g, el] of dividers.current) {
      el.hidden = !triggers.current.has(g) && (sizeOf.get(g) ?? 0) > 0 && collapsedIn.get(g) === sizeOf.get(g)
    }
  }, [])

  /** 攤開 → 量 → 決定 → 寫回;容器量不到寬(還沒排版 / 被藏起來)時照上一次的決定寫回、回 null */
  const decide = React.useCallback((): CollapseDecision | null => {
    const container = containerRef.current
    const records = [...items.current].filter(([, r]) => r.el.isConnected)
    if (!container) return null
    // ① 攤開(觸發鈕轉量尺:絕對定位、看不見;原本的行內樣式記下來,量完放回去)
    for (const [, r] of records) r.el.hidden = false
    const saved = new Map<HTMLElement, [string, string]>()
    for (const [, el] of triggers.current) {
      saved.set(el, [el.style.position, el.style.visibility])
      el.hidden = false
      el.style.position = 'absolute'
      el.style.visibility = 'hidden'
    }
    for (const [, el] of dividers.current) el.hidden = false
    // ② 量(這一次讀版面就把下面要量的全部排好)
    const contentW = contentInlineSize(container)
    const cs = getComputedStyle(container)
    const gap = parseFloat(cs.columnGap) || 0
    let natural = 0
    let flowCount = 0
    for (const child of Array.from(container.children)) {
      if (child.getClientRects().length === 0) continue
      const pos = getComputedStyle(child).position
      if (pos === 'absolute' || pos === 'fixed') continue
      natural += outerInlineSize(child)
      flowCount++
    }
    natural += gap * Math.max(0, flowCount - 1)
    const widths = new Map<Element, number>()
    const footprint = (el: HTMLElement) => {
      const w = outerInlineSize(el)
      widths.set(el, el.getBoundingClientRect().width)
      return w + gap
    }
    // 收起順序:優先順序小的先收;同值索引大的先收
    const order = records
      .map(([i, r]) => ({ i, group: r.group, priority: r.priority, w: footprint(r.el) }))
      .sort((a, b) => a.priority - b.priority || b.i - a.i)
    const triggerW = new Map<string, number>()
    for (const [g, el] of triggers.current) triggerW.set(g, footprint(el))
    const dividerW = new Map<string, number>()
    for (const [g, el] of dividers.current) dividerW.set(g, footprint(el))
    for (const [el, [position, visibility]] of saved) { el.style.position = position; el.style.visibility = visibility }
    if (contentW <= 0) { apply(new Set(decisionRef.current.indices)); return null }
    // ③ 決定:預先算好「收起前 k 個」時的內容寬與觸發鈕寬(k = 0…n)
    const groupSize = new Map<string, number>()
    for (const o of order) groupSize.set(o.group, (groupSize.get(o.group) ?? 0) + 1)
    const contentAt = [natural]
    const triggerAt = [0]
    const collapsedIn = new Map<string, number>()
    for (const o of order) {
      const n = (collapsedIn.get(o.group) ?? 0) + 1
      collapsedIn.set(o.group, n)
      let content = contentAt[contentAt.length - 1] - o.w
      let trigger = triggerAt[triggerAt.length - 1]
      if (n === 1 && triggerW.has(o.group)) trigger += triggerW.get(o.group)!
      // 沒有觸發鈕的群組全部收起:它的分隔線一起藏(apply 同一條)
      if (!triggerW.has(o.group) && n === groupSize.get(o.group) && dividerW.has(o.group)) content -= dividerW.get(o.group)!
      contentAt.push(content)
      triggerAt.push(trigger)
    }
    const k = decideCollapsedCount({
      count: order.length,
      available: contentW,
      contentWidth: (n) => contentAt[n],
      triggerWidth: (n) => triggerAt[n],
    })
    // ④ 寫回
    const collapsed = new Set(order.slice(0, k).map((o) => o.i))
    apply(collapsed)
    used.current = { contentW, widths }
    const groupOf = new Map<number, string>()
    for (const o of order.slice(0, k)) groupOf.set(o.i, o.group)
    return { indices: [...collapsed].sort((a, b) => a - b), groupOf }
  }, [apply])

  const commit = React.useCallback((next: CollapseDecision | null, sync: boolean) => {
    if (!next) return
    const prev = decisionRef.current
    const same = prev.indices.length === next.indices.length
      && prev.indices.every((v, i) => v === next.indices[i] && prev.groupOf.get(v) === next.groupOf.get(v))
    if (same) return
    decisionRef.current = next
    if (sync) flushSync(() => setDecision(next))
    else setDecision(next)
  }, [])

  // 掛載與註冊有變時:畫面更新前量、收、定案(layout effect 裡的 setState 在同一次畫面更新前同步重繪)
  React.useLayoutEffect(() => {
    if (decidedVersion.current === version.current) return
    decidedVersion.current = version.current
    commit(decide(), false)
  })

  // 之後的重算:寬度變了(容器變寬變窄、項目換字、字型載入)才重量
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const stale = (entry: ResizeObserverEntry): boolean => {
      const u = used.current
      if (!u) return true
      const t = entry.target
      if (t === container) return Math.abs(entry.contentRect.width - u.contentW) > FIT_EPSILON_PX
      if ((t as HTMLElement).hidden) return false
      const was = u.widths.get(t)
      const now = entry.borderBoxSize?.[0]?.inlineSize ?? t.getBoundingClientRect().width
      return was === undefined || Math.abs(now - was) > FIT_EPSILON_PX
    }
    const ro = new ResizeObserver((entries) => {
      if (!entries.some(stale)) return
      commit(decide(), true)
    })
    observer.current = ro
    ro.observe(container)
    for (const [, r] of items.current) ro.observe(r.el, { box: 'border-box' })
    for (const [, el] of triggers.current) ro.observe(el, { box: 'border-box' })
    for (const [, el] of dividers.current) ro.observe(el, { box: 'border-box' })
    return () => { ro.disconnect(); observer.current = null }
  }, [commit, decide])

  const overflowIndicesOf = React.useCallback(
    (group: string = DEFAULT_OVERFLOW_GROUP) => decision.indices.filter((i) => decision.groupOf.get(i) === group),
    [decision]
  )

  return {
    containerRef,
    registerItem,
    registerTrigger,
    registerDivider,
    overflowIndices: decision.indices,
    hasOverflow: decision.indices.length > 0,
    overflowIndicesOf,
  }
}
