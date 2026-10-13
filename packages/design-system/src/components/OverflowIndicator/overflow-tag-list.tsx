/**
 * @internal — DS-internal 單元(per `packages/design-system/ds-canonical/rules/ui-development.md` Public vs Internal canonical)。
 * 不進 root barrel front-door;Combobox(含 PeoplePicker 標籤模式、DataTable 多選格、篩選值挑選器)與 AgentPanel 輸入盒附件列消費。
 *
 * 單行 Tag 列 + 「+N」:放得下幾顆、其餘收進「+N」的唯一實作(2026-10-13 自 combobox.tsx 抽出,AgentPanel 附件列改用同一份 ——
 * 修前附件列另有一份:`useOverflowIndices` + 寫死 48px 的「+N」寬、全部放得下也照留,與 Combobox 修前同一個缺口)。
 * 規則 `../Combobox/combobox.spec.md`「單行溢出」;閘 `scripts/tag-overflow-room-invariant.mjs`(逐格畫面、兩種時序)。
 */
import * as React from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'
import { Tag } from '@/design-system/components/Tag/tag'
import { OverflowIndicator, OverflowIndicatorMeasure } from './overflow-indicator'

/** Tag 列的預設間距(px;Combobox 的 Tag 區、唯讀欄位外框與 AgentPanel 附件列都是 4) */
export const TAG_ROW_GAP_PX = 4

// ── useOverflowCount ────────────────────────────────────────────────────────

/**
 * 「+N」現在只當量尺(沒有東西要收進去)時,包它的那一格掛這個屬性:不佔位、看不見、點不到、讀屏略過,但**量得到寬**。
 * 由 `useOverflowCount` 直接寫在 DOM 上(與 Tag 的 `hidden` 同一批、同一個 task),不經 React —— 收不收、幾個,一次定案。
 */
const OVERFLOW_MEASURE_ATTR = 'data-overflow-measure'
/** 寬度比較的容差(px):量測值是 1/64px 的倍數,這個容差只吃浮點誤差,不吃任何真的版面差 */
const FIT_EPSILON_PX = 0.01

/**
 * 單行 Tag 列看得見幾個(其餘收進「+N」)。規則 combobox.spec.md「單行溢出」;2026-10-13 重寫(待辦 Q1 / K6)。
 *
 * **每一個輸入都是真的量到的,不猜**:
 * - 「+N」一律渲染(沒有東西要收時是量尺,`OVERFLOW_MEASURE_ATTR`),所以第一次決定就有真的東西可量。
 *   修前沒溢出時「+N」根本不渲染、量到 0 就拿 60px 頂替(實際 33–35px)—— DataTable「專案排程全功能整合」標籤格一點就變「+2」的直接原因
 *   (同一個病 2026-05-15 就記在 `../PeoplePicker/avatar-stack-overflow.ts` 檔頭,當時只替頭像堆疊換成公式)。
 * - **每個候選數量用它自己會顯示的那個「+N」的寬**:放 c 顆時顯示的是「+(總數 − c)」,就量那個字串(把「+N」那個文字節點改成該數字、量、改回來)。
 *   數字的字寬不一樣(+1 33.02 / +2 34.97 / +10 41.69px),拿「全部收起時的 +N」或「看過最寬的 +N」代表每一個候選,
 *   會在邊界附近留下一段「明明放得下,卻顯示 +N」的寬度(2026-10-13 獨立驗證:2px;收起數有兩位數時 6–8px)。只在邊界附近多量一兩次。
 * - 可用寬與 Tag 寬同一種單位(小數 px,`getBoundingClientRect`)。修前可用寬用整數 `clientWidth`,272.36 讀成 272、三顆 Tag 272.35 就放不下(K6)。
 * - 量的是「全部攤開」那一刻的版面:先把 Tag 全部顯示、「+N」轉成量尺、Tag 寬上限變數拿掉,再量。所以量到的寬不受上一次決定影響 ——
 *   依內容寬(`width="hug"`)的欄位攤開時被父層(`max-w-full`)擋住的地方,就是它真的能用的寬(與 PeoplePicker 頭像堆疊 2026-09-07 拆的棘輪同一類:
 *   量一個不隨這次決定改變的寬)。填滿寬的欄位攤開與否寬度都一樣,結果與只量一次相同。
 * - 全部放得下就不替「+N」留位(rc-overflow「最後兩顆」那一條)。
 *
 * **誰會叫它重算**:ResizeObserver 看容器、每顆 Tag、「+N」、搜尋框量尺,**再加欄位外框(`[data-field-mode]`)的父層**。
 * 依內容寬的欄位,容器的寬是自己的內容決定的:父層變寬時容器、Tag、「+N」一個都不會變,沒有任何通知 —— 「+N」就卡住,空間回來也放不回去
 *(2026-10-13 獨立驗證:窄容器 192 → 400px 仍是「Electronics +2」;縮到 120 再放大永遠停在「+3」)。所以要看那個**限制它寬度的人**:
 * 欄位外框的父層(PeoplePicker 頭像堆疊同一個選擇,`../PeoplePicker/person-display.tsx` `containingBlock`)。父層寬變了就重算 —— 重算時照樣攤開量,
 * 攤開的欄位被父層擋在哪裡,可用寬就是多少(不另算「父層寬 − 外框開銷」:攤開量到的就是那個數,而且連欄位自己若另有寬上限也一併算進去)。
 *
 * **決定與「+N」的數字在同一次畫面更新前定案**:在 layout effect(畫面更新前)量、寫 Tag 的 `hidden` 與量尺屬性、setState ——
 * layout effect 裡的 setState 會在同一次畫面更新前同步重繪,所以不會有任何一格畫面是「Tag 收了、數字還沒變」或「數字對、Tag 還沒收」。
 * 之後的重算由 ResizeObserver 觸發,回呼在瀏覽器畫下一格之前跑,以 `flushSync` 同步提交,一樣同一格定案。
 * 修前判斷在 passive effect(畫完之後才跑)、數字等 React 下一個工作才畫:中間插進一格就會畫出錯的樣子;
 * 而「錯了能不能改回來」全看點擊和 React 補畫之間剛好有沒有一格畫面(Chromium 的輸入後先畫一格政策會給,遠端隔離環境、Safari、Firefox 不一定)。
 *
 * **一次掛載只量一次**(2026-09-10 的效能目標保留):ResizeObserver 送來的每一發都先跟這次決定用過的輸入比 ——
 * 容器內容寬、每顆看得見的 Tag 寬、搜尋框量尺寬、外框父層的寬一樣,「+N」的寬等於這次決定量到的那一個,就不重算。`observe()` 必送的初始觀測回報的就是剛定案的版面,
 * 所以填滿寬的儲存格掛載只跑一趟。修前是「不分青紅皂白吞掉第一發」:第一發剛好是決定之後版面變了的那一發時(例如「+N」從 0 變 35px),
 * 該改正的機會就被吞掉 —— 判斷「這次量測可不可信」時也沒把「+N 的寬是猜的」算進去。
 *
 * 容器 = 列表本身(`display: contents` 的那一層)的父元素,不經呼叫端的 ref:layout effect 跑的時候祖先的 ref 還沒接上
 * (React 先跑子層的 layout effect、後接祖先的 ref;2026-05-18 Round 5 因此退回 passive effect),但 DOM 已經插好,父元素拿得到。
 */
function useOverflowCount({
  listRef, tagEls, overflowEl, totalCount, contentKey, enabled, gap, visibleCountOverride, getReserveEl,
}: {
  /** 列表本身(`display: contents`);它的父元素就是量寬的容器 */
  listRef: React.RefObject<HTMLElement | null>
  tagEls: React.MutableRefObject<(HTMLDivElement | null)[]>
  overflowEl: React.RefObject<HTMLDivElement | null>
  totalCount: number
  /** 各項的值與文字(任一變了就重量 —— 被收起來的 Tag 文字變了,ResizeObserver 看不到) */
  contentKey: string
  enabled: boolean
  /** (2026-05-07 v15.13)stack avatar 模式傳 0 */
  gap: number
  /** 2026-05-15 Bug 3 fix:override DOM measurement(PeoplePicker stack 走 formula primitive) */
  visibleCountOverride?: number
  /**
   * 2026-09-30:Tag 後面要留給別的東西的寬 —— Combobox 欄位內搜尋框的量尺(`findInlineSearchMirror`,在容器裡找)。量它、也觀察它:打字變寬就重算,
   * 放不下時把 Tag 收進 +N,讓打的字看得見(rc-overflow 把 suffix 的寬算進可見數,Ant 單行多選 responsive 就是這條,出處見 combobox.spec.md)
   */
  getReserveEl?: (container: HTMLElement) => HTMLElement | null
}): number {
  const [visibleCount, setVisibleCount] = React.useState(totalCount)

  React.useLayoutEffect(() => {
    if (!enabled || totalCount === 0) { setVisibleCount(totalCount); return }
    if (visibleCountOverride !== undefined) {
      for (let i = 0; i < tagEls.current.length; i++) {
        const el = tagEls.current[i]
        if (el) el.hidden = i >= visibleCountOverride
      }
      overflowEl.current?.toggleAttribute(OVERFLOW_MEASURE_ATTR, visibleCountOverride >= totalCount)
      setVisibleCount(visibleCountOverride); return
    }
    // totalCount=1 fast path:single-tag case 直接 visible 不跑 measurement loop。
    // (歷史:c90d029 曾移除此 bypass,後復原 — 移除會造成 narrow cell 1-selected 跑 unbounded Tag
    // measurement 後 visibleCount=0 → 顯 +1 indicator 而非 single tag,違反 PeoplePicker length===1
    // 走 PersonDisplay SSOT。)明確 unhide(從 length>1 降到 1 時可能殘留 hidden)。
    if (totalCount === 1) {
      for (let i = 0; i < tagEls.current.length; i++) {
        const el = tagEls.current[i]
        if (el) el.hidden = i >= 1
      }
      overflowEl.current?.toggleAttribute(OVERFLOW_MEASURE_ATTR, true)
      setVisibleCount(1); return
    }
    const list = listRef.current
    const container = list?.parentElement
    if (!list || !container) return
    // 限制欄位寬度的那一層:欄位外框(`[data-field-mode]`,編輯態的 Tag 區在它裡面、唯讀 / 停用時容器就是它)的父層(見上方「誰會叫它重算」)
    const frameParent = container.closest<HTMLElement>('[data-field-mode]')?.parentElement ?? null

    // 這次決定用過的輸入(ResizeObserver 拿來比:一樣就不重算)
    let used: { contentW: number; tagW: Map<Element, number>; indicatorW: number; reserveW: number; frameParentW: number } | null = null

    const decide = (): number => {
      const ofEl = overflowEl.current
      const mirror = getReserveEl?.(container) ?? null
      // 「+N」的字(單一文字節點,OverflowIndicator `OverflowCount`):量各個候選數字時改它、量完改回 React 給的字
      const countText = ofEl?.querySelector('[data-overflow-count]')?.firstChild
      const countNode = countText && countText.nodeType === Node.TEXT_NODE ? countText as Text : null
      const shownText = countNode?.data ?? ''
      // ① 攤開:全部 Tag 顯示、「+N」轉量尺(不佔位)並寫成全部收起時的數字(最壞情況,「+N」的寬下限要用它)、Tag 寬上限變數拿掉 ——
      //    這一刻的版面與上一次決定無關
      container.style.removeProperty('--combobox-tag-area-inline-size')
      for (const el of tagEls.current) if (el) el.hidden = false
      ofEl?.setAttribute(OVERFLOW_MEASURE_ATTR, '')
      if (countNode) countNode.data = `+${totalCount}`
      // ② 可用寬(小數 px):容器內容寬,扣掉同一列裡不是 Tag 的東西(唯讀欄位的箭頭;欄位內搜尋框另外以量尺計)。這一次讀版面就把下面要量的全部排好
      //(Tag、「+N」、量尺都在同一份乾淨的版面上讀,不再觸發第二次)
      const cs = getComputedStyle(container)
      const padBorder = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
        + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0)
      const contentW = container.getBoundingClientRect().width - padBorder
      let available = contentW
      for (const child of Array.from(container.children)) {
        if (child === list || (mirror && child.contains(mirror)) || child.getClientRects().length === 0) continue
        const pos = getComputedStyle(child).position
        if (pos === 'absolute' || pos === 'fixed') continue
        available -= child.getBoundingClientRect().width + gap
      }
      const reserveW = mirror?.getBoundingClientRect().width ?? 0
      const reserve = reserveW > 0 ? gap + reserveW : 0
      let frameParentW = -1
      if (frameParent) {
        const ps = getComputedStyle(frameParent)
        frameParentW = frameParent.getBoundingClientRect().width - (parseFloat(ps.paddingLeft) || 0) - (parseFloat(ps.paddingRight) || 0)
          - (parseFloat(ps.borderLeftWidth) || 0) - (parseFloat(ps.borderRightWidth) || 0)
      }
      // ③ Tag 寬:量 paint target `[data-tag-root]`(2026-05-18 Round 5:wrapper 可能被 consumer 的 class 撐寬)。
      // 量的是沒有寬上限變數時的寬(Tag 自己的 160px 上限照舊):比可用寬還寬的那顆本來就放不進(放得進的每一顆都 ≤ 可用寬,
      // 上限變數對它們不起作用),所以決定與「先設上限再量」相同 —— 少一次強制版面(這一段只在 ② 那一次)。
      const tagW = new Map<Element, number>()
      const widths: number[] = []
      for (let i = 0; i < totalCount; i++) {
        const el = tagEls.current[i]
        if (!el) { widths.push(0); continue }
        const tagRoot = el.querySelector<HTMLElement>('[data-tag-root]') ?? el
        const w = tagRoot.getBoundingClientRect().width
        widths.push(w)
        tagW.set(el, w)
      }
      // ④「+N」的寬,一個數字一個寬:「+總數」在 ② 那一次就量好了;其他數字要用到才量(改字 → 量 → 下一個),全部量完把字改回去
      const allCollapsedW = ofEl?.getBoundingClientRect().width ?? 0
      const plusW = new Map<number, number>([[totalCount, allCollapsedW]])
      const plusWidth = (n: number): number => {
        const hit = plusW.get(n)
        if (hit !== undefined) return hit
        if (!countNode || !ofEl) return allCollapsedW
        countNode.data = `+${n}`
        const w = ofEl.getBoundingClientRect().width
        plusW.set(n, w)
        return w
      }
      // ⑤ 決定:全部放得下 → 全顯示、不留「+N」的位;否則找最多能放幾顆 c,使「c 顆 Tag + 它自己的『+(總數 − c)』」放得下
      //(**#3 fix 2026-05-04**:含第一顆 —— 一顆自己就太寬時 c = 0,全部進 +N)
      const prefix = [0] // prefix[c] = 前 c 顆 Tag 連同中間間距的寬
      for (let i = 0; i < totalCount; i++) prefix.push(prefix[i] + (i > 0 ? gap : 0) + widths[i])
      let count = 0
      if (prefix[totalCount] + reserve <= available + FIT_EPSILON_PX) count = totalCount
      else {
        const fits = (c: number): boolean => {
          const tags = prefix[c] + gap + reserve
          if (tags > available + FIT_EPSILON_PX) return false // 不用量「+N」就知道放不下
          return tags + plusWidth(totalCount - c) <= available + FIT_EPSILON_PX
        }
        // 起點:用「+總數」的寬(已量到)估,再用每個候選自己的「+N」往下 / 往上修 —— 只在邊界附近多量一兩個數字
        while (count + 1 < totalCount && prefix[count + 1] + gap + allCollapsedW + reserve <= available + FIT_EPSILON_PX) count++
        while (count > 0 && !fits(count)) count--
        while (count + 1 < totalCount && fits(count + 1)) count++
      }
      // 決定之後「+N」那一格會是多寬(ResizeObserver 拿來比):有收 → 顯示的那個數字(上面判它放得下時量過);沒收 → 量尺,React 畫的是「+總數」
      const indicatorW = count < totalCount ? plusWidth(totalCount - count) : allCollapsedW
      if (countNode) countNode.data = shownText // React 給的字放回去(React 只在數字變了時才寫這個節點)
      for (let i = 0; i < tagEls.current.length; i++) { const el = tagEls.current[i]; if (el) el.hidden = i >= count }
      ofEl?.toggleAttribute(OVERFLOW_MEASURE_ATTR, count >= totalCount)
      // 2026-05-18 Round 5:可用寬以 CSS 變數交給 Tag 當上限(explicit length,避開 CSS Sizing 3 §5.2.1 cyclic percentage);
      // 有欄位內搜尋框時扣掉它的位:一顆長 Tag 截斷在搜尋框前面,不把它擠出去(只有一顆、它自己就比可用寬還寬時才真的起作用)。
      container.style.setProperty('--combobox-tag-area-inline-size', `${Math.max(0, available - reserve)}px`)
      // (2026-05-18 Round 5 曾在這裡加「最後一顆看得見的 Tag 右緣超出容器就再收一顆」的保險,防整數 / 小數混用的進位誤差。
      //  可用寬與 Tag 寬改成同一種小數單位之後,算式本身就是版面:不再需要事後量一次 —— 拿掉它也少一次強制版面。)
      // 2026-09-08:標籤列是 `flex-1 min-w-0`,容器夠窄時它會被壓到 0 寬,而「+N」在裁切容器內、會一起被裁掉 ——
      // 空間不足時唯一還帶資訊的元素反而看不到。給容器一個下限 = 全部收起時那個「+N」的寬(它是最後才被放棄的東西,那時顯示的就是它)。
      // 用量到的寬(修前在沒量到時是猜的 60px,卡住時欄位多佔 25px)。下限不隨這次決定改變,以免「設下限 → 夠了 → 收起 → 撤下限 → 不夠」來回跑。
      container.style.minInlineSize = `${allCollapsedW}px`
      used = { contentW, tagW, indicatorW, reserveW, frameParentW }
      return count
    }

    setVisibleCount(decide())

    const reserveEl = getReserveEl?.(container) ?? null
    // 輸入變了才重算(見上方「一次掛載只量一次」):被收起的 Tag 不比(寬 0 是自己收的)
    const stale = (entry: ResizeObserverEntry): boolean => {
      if (!used) return true
      const t = entry.target as HTMLElement
      const w = entry.contentRect.width
      if (t === container) return Math.abs(w - used.contentW) > FIT_EPSILON_PX
      if (t === frameParent) return Math.abs(w - used.frameParentW) > FIT_EPSILON_PX
      if (t === overflowEl.current) return Math.abs(w - used.indicatorW) > FIT_EPSILON_PX
      if (t === reserveEl) return Math.abs(w - used.reserveW) > FIT_EPSILON_PX
      if (t.hidden) return false
      const was = used.tagW.get(t)
      return was === undefined || Math.abs(w - was) > FIT_EPSILON_PX
    }
    const ro = new ResizeObserver((entries) => {
      if (!entries.some(stale)) return
      // 回呼在下一格畫面之前跑:Tag 的 hidden 與「+N」的數字都要在這一格定案 → 同步提交
      const next = decide()
      flushSync(() => setVisibleCount(next))
    })
    ro.observe(container)
    for (const el of tagEls.current) if (el) ro.observe(el)
    if (overflowEl.current) ro.observe(overflowEl.current)
    // 欄位內搜尋框的量尺:打字變寬 / 刪字變窄都重算
    if (reserveEl) ro.observe(reserveEl)
    // 欄位外框的父層:依內容寬的欄位只有它會在「空間回來」時變(見上方「誰會叫它重算」)
    if (frameParent) ro.observe(frameParent)
    return () => ro.disconnect()
  // 2026-09-29 exhaustive-deps:listRef / tagEls / overflowEl 是 OverflowTagList 自己 useRef 出來的 ref 物件,身分整個生命週期不變;
  // getReserveEl 由呼叫端傳模組層函式(身分不變)或 undefined。
  }, [listRef, tagEls, overflowEl, totalCount, contentKey, enabled, gap, visibleCountOverride, getReserveEl])

  return visibleCount
}

// ── OverflowTagList ──────────────────────────────────────────────────────────

export type OverflowTagShape = 'circle' | 'tag'

// 2026-05-16 fix:overflow chip wrapper 必能跟 tag wrapper 套同 overlap class
// (per user 物理模型「avatar 和 +N 都是同尺寸圓形 + 同 step」)。原 chip wrapper
// 只有 `shrink-0`,在 stack 模式 -ml-0.5 不 apply → chip 不 overlap → 視覺多 22px
// 額外空間 → length=4→4 / length=5→2+3 saw bug 物理根因。
// PeoplePicker stack mode pass `'-ml-0.5 first:ml-0 relative inline-flex'` 對齊。
export interface OverflowTagListProps {
  items: { value: string; label: string }[]
  size: 'sm' | 'md' | 'lg'
  wrap: boolean
  renderTag: (item: { value: string; label: string }, index: number) => React.ReactNode
  /**
   * 2026-05-14 I4 fix(per codex M31 verdict + user 抓「display overflow 有 avatar / edit 無」):
   * Optional renderer for hidden items in `+N` overflow popover。Default fallback = `<Tag>{label}</Tag>`
   * (純文字 chip,backward-compat)。Consumer pass 此 prop 讓 hidden items 顯示同 avatar 視覺
   * (對齊 view path MultiPersonDisplay overflow popover Tag avatar SSOT)。
   * 第二個參數 = 這一項的移除(與 `renderTag` 的 Tag 同一條移除路徑,見 CustomCombobox `handleRemove`)。
   */
  renderHiddenTag?: (item: { value: string; label: string }, onRemove: () => void) => React.ReactNode
  onRemove?: (value: string) => void
  /** 按在 +N 浮出清單上的 mousedown(portal;觸發欄位上的 onMouseDown 看不到它),見 CustomCombobox `keepSearchFocus` */
  onOverflowMouseDown?: React.MouseEventHandler<HTMLDivElement>
  /** +N 浮出清單的 id(portal;觸發欄位以它把這張卡算成同一個欄位的零件,見 CustomCombobox 觸發區的 onBlur) */
  overflowContentId?: string
  /** 單行模式要在 Tag 後面替別的東西留位時,傳「從容器找到那個東西」的函式(Combobox 欄位內搜尋框:`findInlineSearchMirror`);沒有就不傳 */
  getReserveEl?: (container: HTMLElement) => HTMLElement | null
  /** Tag area gap in px(default 4)。Stack mode 傳 0 讓 negative margin 生效 */
  gap?: number
  /**
   * Optional class merged into each tag's outer measurement wrapper `<div className="shrink-0">`.
   * (2026-05-07 v15.13)為 PeoplePicker stack mode 提供 hook point — 讓 stack avatar 走
   * `-ml-0.5 first:ml-0 relative inline-flex group/avatar` 達成 overlap + dismiss group selector,
   * 同時保留 `useOverflowCount` 量測 wrapper(必要,不可移除)。
   * (stack 模式的可見數走 `visibleCountOverride` 公式,不經 DOM 量測,負 margin 不影響。)
   */
  tagWrapperClassName?: string
  /** 2026-05-16 fix:overflow chip 圓形 wrapper 套此 class(stack 模式套 `-ml-0.5` overlap),
   *  讓 chip 跟 avatar 同 step 物理 — 避免「chip 多 24px 額外空間」造成 saw transition。*/
  overflowWrapperClassName?: string
  /**
   * Overflow indicator(+N)形狀(2026-05-12 Round 7 fix,user 抓 PeoplePicker stack +N 該圓形):
   * - `'tag'`(default,backward-compat)— 矩形 chip(對齊 Combobox 文字 tag)
   * - `'circle'`(opt-in for avatar stack consumers)— 圓形 avatar-shape +N(對齊 GitHub picker idiom)
   * PeoplePicker stack mode pass `'circle'`,Combobox 文字 tag 自走 `'tag'`。
   */
  overflowShape?: OverflowTagShape
  /**
   * 2026-05-15 Bug 3 fix:override visible count via formula-based primitive(PeoplePicker stack
   * 用 `avatar-stack-overflow` primitive deterministic formula 計算 visible,bypass DOM offsetWidth
   * measurement)。對齊 user SSOT「同 cell width 同 overflow 判斷」。
   */
  visibleCountOverride?: number
}

/**
 * @internal 單行(+N)/ 換行兩種 Tag 列。單行時的可見數見 `useOverflowCount`。
 * 容器 = 這個列表的父元素(呼叫端把它放在要量寬的那一層裡,而且那一層要是定位容器:Combobox 觸發欄位的 Tag 區、唯讀欄位外框、
 * 檢視態的 Tag 列,AgentPanel 輸入盒的附件列)。
 */
export function OverflowTagList({ items, size, wrap, renderTag, renderHiddenTag, onRemove, onOverflowMouseDown, overflowContentId, getReserveEl, tagWrapperClassName, overflowWrapperClassName, gap = TAG_ROW_GAP_PX, overflowShape = 'tag', visibleCountOverride }: OverflowTagListProps) {
  const listRef = React.useRef<HTMLSpanElement>(null)
  const tagEls = React.useRef<(HTMLDivElement | null)[]>([])
  const overflowEl = React.useRef<HTMLDivElement>(null)
  const contentKey = items.map((item) => `${item.value}\u0001${item.label}`).join('\u0000')
  const visibleCount = useOverflowCount({ listRef, tagEls, overflowEl, totalCount: items.length, contentKey, enabled: !wrap, gap, visibleCountOverride, getReserveEl })
  tagEls.current.length = items.length

  // key 用值(2026-09-30 補):renderTag 回傳的節點本身不帶 key,缺 key 時 React 以索引對應 —— 移除一個 Tag,後面那一顆會沿用它的 DOM
  if (wrap) return <>{items.map((item, i) => <React.Fragment key={item.value}>{renderTag(item, i)}</React.Fragment>)}</>

  const overflow = items.length - visibleCount
  const hiddenItems = items.slice(visibleCount)

  // `<span className="contents">`:列表本身不產生盒子(Tag 與「+N」直接是容器的 flex 子項);它的父元素就是量寬的容器(useOverflowCount)。
  // **量測 wrapper 必須是 flex 容器,不能是區塊盒**(2026-09-15 user 抓「sm 的 tag 沒垂直置中」,像素實測):
  // 區塊盒的高度由繼承的字型行高決定(欄位 text-body = 21px),sm 的 Tag 只有 20px(h-5),行內的 Tag 對齊
  // 行盒基線、沉到底部 → tag 區 21.8px、tag 上隙 3.9 / 下隙 2.1。md/lg 的 Tag 是 24px ≥ 21,盒子被撐滿才看不出來。
  // flex 容器沒有行盒:高度 = Tag 高度,wrapper `items-center` 直接對 Tag 的盒子置中(sm 3/3、md 3/3、lg 5/5)。
  // Select 的 tag 模式沒有這層 wrapper,一直是正的 —— 這層 wrapper 是 useOverflowCount 量寬用的,寬度量法不變
  //(flex 容器在 flex row 裡 shrink-0 的 max-content 寬 = 內容寬,跟區塊盒相同)。閘:`scripts/tag-field-vertical-inset.mjs`。
  return (
    <span ref={listRef} className="contents">
      {items.map((item, i) => (
        // 2026-05-14 I5 fix(per codex M31 verdict + user 抓「avatar stack 堆疊方向不一致」):
        // 加 z-index per-index — 前 item z 高(對齊 MultiPersonDisplay zIndex: visible.length - i
        // canonical + MUI AvatarGroup surplus pattern)。view + edit stack 堆疊方向統一。
        // 2026-09-26:疊放順序改走 CSS 變數,裡面有東西拿到鍵盤焦點時整項升到最上層 —— 焦點框往外畫,不升的話
        // 左半圈會被前一項蓋住(同 avatar.tsx AVATAR_STACK_ITEM_CLASS 的理由;頭像堆疊只在 PeoplePicker 會重疊,一般 Tag 不重疊、升層無副作用)
        <div key={item.value} ref={el => { tagEls.current[i] = el }}
          className={cn('shrink-0 max-w-full flex z-[var(--tag-stack-z)] has-[:focus-visible]:z-[var(--tag-stack-z-focus)]', tagWrapperClassName)}
          style={{ ['--tag-stack-z' as string]: items.length - i, ['--tag-stack-z-focus' as string]: items.length + 1 }}>{renderTag(item, i)}</div>
      ))}
      {/* 「+N」恆在:有東西收進去時是可互動的指示器;沒有時是量尺(OVERFLOW_MEASURE_ATTR:絕對定位在容器左上、看不見、點不到、讀屏略過),
          數字是全部收起時的 N(useOverflowCount 量各個候選數字時會暫時改它的字、量完改回)—— 第一次決定就有真的東西可量。容器要是定位容器,量尺才待在被裁切的容器裡,
          不會撐出外層捲動範圍(Tag 區 / 欄位外框都是 relative)。 */}
      <div ref={overflowEl} data-overflow-measure={overflow > 0 ? undefined : ''}
        className={cn('shrink-0 flex has-[:focus-visible]:z-[var(--tag-stack-z-focus)]',
          'data-[overflow-measure]:absolute data-[overflow-measure]:left-0 data-[overflow-measure]:top-0 data-[overflow-measure]:invisible data-[overflow-measure]:pointer-events-none',
          overflowWrapperClassName)}
        style={{ ['--tag-stack-z-focus' as string]: items.length + 1 }}>
        {overflow > 0 ? (
          <OverflowIndicator count={overflow} shape={overflowShape} size={size} onContentMouseDown={onOverflowMouseDown} contentId={overflowContentId}>
            {hiddenItems.map(item => (
              renderHiddenTag
                ? <React.Fragment key={item.value}>{renderHiddenTag(item, () => onRemove?.(item.value))}</React.Fragment>
                : <Tag key={item.value} size="sm" onRemove={onRemove ? () => onRemove(item.value) : undefined}>
                    {item.label}
                  </Tag>
            ))}
          </OverflowIndicator>
        ) : (
          <OverflowIndicatorMeasure count={items.length} shape={overflowShape} size={size} />
        )}
      </div>
    </span>
  )
}
