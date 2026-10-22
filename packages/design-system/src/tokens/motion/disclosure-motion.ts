/**
 * 原地展開收合(disclosure)的高度動畫 — 何時播 / 時長 / 收尾 / reduced-motion SSOT(2026-10-07,待辦總帳 T6 / T7 / T8)。
 *
 * 消費者(全 DS grep `animate-collapsible|animate-accordion` 不截斷,2026-10-07):
 *   - TreeView 子項容器(`components/TreeView/tree-view.tsx`,Radix Collapsible.Content)
 *   - Accordion 內容(`components/Accordion/accordion.tsx`,Radix Accordion.Content —— 內部就是 Collapsible.Content,
 *     同一個節點上也有 `--radix-collapsible-content-height`(@radix-ui/react-accordion dist/index.mjs:290),所以共用同一組 keyframe)
 *   - AgentPanel 思考塊(`components/AgentPanel/agent-panel.tsx`,Radix Collapsible.Content)
 *   不在此族:Sidebar 可收合群組(沒有動畫,收起當下就隱藏)、Steps 內容與 DataTable 巢狀列(條件渲染)。
 *
 * 組成:
 *   - `overflow-hidden`:高度動畫靠裁切,少了它收合途中內容會溢出 —— 屬於動畫本身的前提,所以住在這裡。
 *   - 時長 `--motion-duration-disclosure`(motion.css;值 = 三個消費者現況實際渲染的 200ms,待辦總帳 T8)。
 *     曲線 `ease-out` = tw-animate-css collapsible 工具類的預設 `var(--tw-ease, ease-out)`;2026-10-13 起寫明在
 *     `DISCLOSURE_TIMING`(值不變),讓內容與箭頭從同一個常數拿時長與曲線(見下「箭頭」)。注意是 CSS 關鍵字 `ease-out`
 *     (cubic-bezier(0, 0, 0.58, 1)),**不是** Tailwind 的 `ease-out` 工具類(那個是 `--ease-out` = cubic-bezier(0, 0, 0.2, 1))。
 *   - 何時播:動畫只宣告在 `motion-safe:` 底下 —— 原本 `motion-reduce:animate-none` 的權重 (0,1,0) 輸給
 *     `data-[state=closed]:animate-collapsible-up` 的 (0,2,0),減少動態從來沒生效(待辦總帳 T7;同 overlay-motion.ts 檔頭)。
 *   - 收尾:關閉狀態保持高度 0(`closed-end-state.ts`),不靠 Radix Presence 的執行期補丁(待辦總帳 T6)。
 *
 * **箭頭(2026-10-13,motion.spec.md「開合動畫」同族另見 (3),AI 建議「乙」、user 2026-10-07 採納,原話見 motion.spec.md)**:原地展開的旋轉箭頭跟它打開的內容同一個時長與曲線,
 * 兩者一起開始、一起停 —— `disclosureIndicatorMotion`。消費者:TreeView 子項箭頭、Accordion 標題箭頭、AgentPanel 思考塊箭頭、
 * Sidebar 可收合群組箭頭、DataTable 展開列箭頭(後兩者的內容沒有高度動畫,箭頭照樣吃原地展開這一檔 —— 它們同屬「原地展開」,
 * 一個 DS 裡原地展開的箭頭只有一種手感)。旋轉角度(rotate-90 / rotate-180,item-anatomy.spec.md「Chevron 方向慣例」)是幾何,消費端寫。
 *
 * keyframe 與工具類由 tw-animate-css 提供(styles/tokens.css 引入);DS 自己**不再**宣告同名 keyframe / 工具類
 * —— 舊 base.css 的 `animate-collapsible-*` 150ms / `animate-accordion-*` 200ms 從 2026-07-14 起就被同名外掛工具類蓋掉,
 * 兩份宣告各寫各的值(待辦總帳 T8),閘 `scripts/motion-ssot-invariant.mjs` 擋同名重宣告。
 */
import { holdClosedEndState } from './closed-end-state'

// 內容與箭頭共用的時長與曲線(唯一住所)。`--tw-duration` / `--tw-ease` 由 Tailwind 註冊為 inherits:false(建置出的 CSS 有
// `@property --tw-duration{…inherits:false}`),寫在內容容器上不會漏到裡面的子元素。
const DISCLOSURE_TIMING = '[--tw-duration:var(--motion-duration-disclosure)] [--tw-ease:ease-out]'

/** 原地展開收合的內容容器(Radix Collapsible.Content / Accordion.Content 的 className)。 */
export const disclosureMotion = `overflow-hidden ${DISCLOSURE_TIMING} motion-safe:data-[state=open]:animate-collapsible-down motion-safe:data-[state=closed]:animate-collapsible-up ${holdClosedEndState}`

/**
 * 原地展開的旋轉箭頭(掛在**會轉的那個圖示本身**)— 與內容同一個時長(200ms)與曲線(ease-out)。
 * 過渡只宣告在 motion-safe 底下:要求減少動態時箭頭直接換角度,不轉(與內容不播高度動畫一致)。
 * 用法:`cn(disclosureIndicatorMotion, isExpanded && 'rotate-90')`、`cn(disclosureIndicatorMotion, '[[data-state=open]>&]:rotate-180')`
 * (角度看自己那顆觸發鈕的狀態:直接父層 `>&` 或命名 group;不寫 `[[data-state=open]_&]` —— 任一層祖先打開都會轉)。
 */
export const disclosureIndicatorMotion = `motion-safe:transition-transform ${DISCLOSURE_TIMING}`
