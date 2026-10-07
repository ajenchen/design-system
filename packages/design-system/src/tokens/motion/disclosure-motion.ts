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
 *     曲線沿用 tw-animate-css collapsible 工具類的 `var(--tw-ease, ease-out)`(現況,未改)。
 *   - 何時播:動畫只宣告在 `motion-safe:` 底下 —— 原本 `motion-reduce:animate-none` 的權重 (0,1,0) 輸給
 *     `data-[state=closed]:animate-collapsible-up` 的 (0,2,0),減少動態從來沒生效(待辦總帳 T7;同 overlay-motion.ts 檔頭)。
 *   - 收尾:關閉狀態保持高度 0(`closed-end-state.ts`),不靠 Radix Presence 的執行期補丁(待辦總帳 T6)。
 *
 * keyframe 與工具類由 tw-animate-css 提供(styles/tokens.css 引入);DS 自己**不再**宣告同名 keyframe / 工具類
 * —— 舊 base.css 的 `animate-collapsible-*` 150ms / `animate-accordion-*` 200ms 從 2026-07-14 起就被同名外掛工具類蓋掉,
 * 兩份宣告各寫各的值(待辦總帳 T8),閘 `scripts/motion-ssot-invariant.mjs` 擋同名重宣告。
 */
import { holdClosedEndState } from './closed-end-state'

/** 原地展開收合的內容容器(Radix Collapsible.Content / Accordion.Content 的 className)。 */
export const disclosureMotion = `overflow-hidden [--tw-duration:var(--motion-duration-disclosure)] motion-safe:data-[state=open]:animate-collapsible-down motion-safe:data-[state=closed]:animate-collapsible-up ${holdClosedEndState}`
