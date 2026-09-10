// ═══════════════════════════════════════════════════════════════════════════
// 量測排程器 —— 「捲動中不量,量的時候一次量完」
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼需要它**(2026-09-10 實測,全功能整合範例 `datatable-展示--roadmap-all-in-one`):
// 4500px/s 手勢捲動 1.4 秒的 CPU 取樣裡,自時間前四名全部是**新進視窗的列格子在 commit 內做強制版面讀取**:
//   1. `components/Tag/tag.tsx` 截斷量測(Canvas measureText + getComputedStyle)  81–87ms
//   2. `components/PeoplePicker/person-display.tsx` 頭像堆疊算可見數(2× getBoundingClientRect)  39–47ms
//   3. `hooks/use-truncated.ts` 預設量法(scrollWidth > clientWidth)  37–43ms
//   4. `components/Combobox/combobox.tsx` 標籤區可用寬(getComputedStyle + setProperty)  19–21ms
// 合計約 190ms,佔取樣 13%;同一段手勢裡 DataTable 自己的捲動同步只花約 10ms。
// 結果是中央捲動容器的**每一個** scroll 事件都要 9–22ms(判準 ≤ 4ms,43/43、48/48、58/58 全數超標)。
//
// **世界級怎麼做**(2026-09-10 第一手原始碼):
//   - AG Grid v33.3.2 `misc/animationFrameService.ts` —— scroll 事件只排隊(`animationFrameSvc.schedule()`),
//     真正的工作在 rAF 的預算迴圈裡做;`rendering/cell/cellCtrl.ts` 與 `cellComp.ts` 兩檔的
//     `getBoundingClientRect` / `offsetWidth` / `clientWidth` 出現次數是 **0** —— 它在捲動路徑上根本不量。
//   - 截斷偵測:AG Grid 只在提示要顯示的那一刻量那一格;MUI X 的內容儲存格完全不量。
//     **沒有任何一家在儲存格掛載時量。**
//   - TanStack Virtual 3.13.23 自己的 `measureElement` 也有「捲動中跳過同步尺寸讀取」的守衛。
//
// **這支做兩件事**:
//   (a) **捲動中不量** —— 任何容器在捲,就把工作留在佇列裡,等捲動停下(100ms 無新事件)再做。
//       使用者在捲動中本來就不會 hover 或用鍵盤走進某一格,延後不影響任何可感知行為。
//   (b) **同一幀一次量完** —— 所有排隊的讀取集中在一個 rAF 裡跑完,瀏覽器只需要算一次版面;
//       原本是 N 個元件各自在自己的 effect 裡讀,每一次都可能強迫重算。
//
// **不做的事**:不快取量測結果(值會隨欄寬 / 字型 / 內容變,快取要失效很難證明正確)、
// 不改任何量法本身(Tag 的 Canvas、Combobox 的 CSS 變數注入原樣保留)—— 只改**時機**。
//
// SSOT:本檔。消費者:`hooks/use-truncated.ts`、`components/PeoplePicker/person-display.tsx`、
// `components/Combobox/combobox.tsx`。機械閘:`scripts/measure-scheduler-invariant.mjs`。

/** 排隊中的量測工作;key 讓同一個消費者重複排程時只留最後一次(避免同一元素量兩遍)。 */
const queue = new Map<object, () => void>()
let frame = 0
let scrolling = false
let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
let attached = false

/** 多久沒有新的 scroll 事件才算「捲完了」。TanStack Virtual 的 `isScrollingResetDelay` 預設是 150ms;
 *  這裡取 100ms —— 比它早一點恢復量測,又足以跨過慣性捲動裡的事件空隙。
 *  (2026-09-10 試過調到 300ms 想讓追平避開一連串短捲之間的停頓,實測沒有幫助、反而更常量到整窗跳轉,已撤回。) */
const SCROLL_SETTLE_MS = 100

/** 一次最多花多少時間排空佇列;超過就把剩下的留到下一次。
 *
 *  **為什麼需要切片**(2026-09-10 4× 節流 A/B 抓到):只延後不切片,等於把整段捲動累積的量測
 *  全部擠進「放手那一刻」的單一任務 —— 實測超過 50ms 的主執行緒任務反而從 24 個變成 32 個。
 *  切片之後,追平的成本攤在停下來後的數次裡,使用者感覺不到,也不會擋住第一次互動。
 *
 *  **為什麼是 8 不是 AG Grid 的 60**:AG Grid 的 `animationFrameService.ts` 用
 *  `executeFrame.bind(this, 60)`,它敢用 60 是因為它的迴圈每做完一個小任務就重新檢查捲動位置、
 *  隨時能轉向(`scrollGridIfNeeded()` 在 while 迴圈第一行);我們這裡跑的是別人的量測函式,
 *  一旦開始就不能中斷,所以取「半幀」當上限,寧可多跨幾次。
 *
 *  走閒置回呼時改用瀏覽器給的 `timeRemaining()`,只在它比這個上限少時才收緊(idle 期間本來就沒人跟我們搶)。 */
const FRAME_BUDGET_MS = 8

/** 追平量測要多晚才算太晚:超過這個時間即使機器一直忙也得做,否則 tooltip / 截斷判定會一直不準。 */
const IDLE_TIMEOUT_MS = 500

function onAnyScroll(): void {
  scrolling = true
  if (scrollEndTimer) clearTimeout(scrollEndTimer)
  scrollEndTimer = setTimeout(() => {
    scrolling = false
    scrollEndTimer = undefined
    if (queue.size) schedule()
  }, SCROLL_SETTLE_MS)
}

/** 第一次用到才掛監聽(SSR 安全);capture 讓內層可捲容器的事件也收得到(它們不冒泡到 document)。 */
function attach(): void {
  if (attached || typeof document === 'undefined') return
  attached = true
  document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
}

/**
 * 排一次排空。
 *
 * **優先用 `requestIdleCallback`**(2026-09-10;dpr2 慢機器的 CI 紅燈根因):追平量測是全場最低優先的工作 ——
 * 沒有人在看它,晚幾百毫秒也不影響任何畫面。用 rAF 排會讓它跟「這一幀要畫什麼」搶同一段時間,
 * 在光柵吃緊的機器上實測把截圖串流的送幀間隔從 106ms 推到 145ms(dpr2 + 4× 節流)。
 * 閒置回呼則是排在瀏覽器確定這一幀沒事做之後,不跟畫面搶;`timeout` 保證忙碌時也不會餓死。
 * 沒有閒置回呼的環境(Safari 舊版 / 某些測試 runner)退回 rAF,再沒有就同步跑完 —— 不靜默丟掉工作。
 */
function schedule(): void {
  if (frame) return
  if (typeof requestIdleCallback !== 'undefined') {
    frame = requestIdleCallback(flush, { timeout: IDLE_TIMEOUT_MS })
    return
  }
  if (typeof requestAnimationFrame === 'undefined') {
    // 沒有 rAF 的環境(SSR / 某些測試 runner):同步跑完,行為與未排程前一致,不靜默丟掉工作。
    flush()
    return
  }
  frame = requestAnimationFrame(() => flush())
}

function flush(deadline?: IdleDeadline): void {
  frame = 0
  // 捲動中就整批留著;`onAnyScroll` 的收尾計時器會在停下來時重排。
  if (scrolling) return
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  // 閒置回呼給的剩餘時間比固定上限更貼近現況,取兩者較小的那個。
  const budget = deadline ? Math.min(FRAME_BUDGET_MS, Math.max(1, deadline.timeRemaining())) : FRAME_BUDGET_MS
  // 用迭代器逐一取出:做一個刪一個,超出預算時剩下的還在佇列裡,下一次接著做。
  for (const [key, task] of [...queue.entries()]) {
    queue.delete(key)
    task()
    if (typeof performance !== 'undefined' && performance.now() - started >= budget) break
  }
  if (queue.size) schedule()
}

/** 排一次量測。同一個 key 重複排程只保留最後一次。 */
export function scheduleMeasure(key: object, task: () => void): void {
  attach()
  queue.set(key, task)
  schedule()
}

/** 元件卸載時取消(虛擬捲動每幀都有列被換掉,不取消就會對著已卸載的節點量)。 */
export function cancelMeasure(key: object): void {
  queue.delete(key)
}

/** 測試用:是否正在捲動(供 `--selftest` 對照組驗證「捲動中不量」)。 */
export function isDeferringForScroll(): boolean {
  return scrolling
}
