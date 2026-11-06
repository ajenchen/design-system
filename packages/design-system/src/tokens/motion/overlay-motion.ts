/**
 * Overlay 進出場動畫 — 共用 何時播 / 時長 / 曲線 / 收尾 / reduced-motion SSOT(2026-07-11;2026-10-07 收進「何時播」與「收尾」)。
 *
 * 消費 `motion.css` 的 `--motion-*` 動畫 token,經 tw-animate-css 的 `--tw-duration` / `--tw-ease`
 * 變數綁定 → 7 浮層時長/曲線/無障礙守衛單一 SSOT,改 token 一處傳播全部(M17)。
 *
 * 幾何(fade / zoom / slide 距離方向)per-prototype 各自帶:
 *   - 輕量浮層(Tooltip/Popover/HoverCard/DropdownMenu):fade + zoom-95 + slide-side-2(8px)
 *   - 模態面板置中(Dialog/FileViewer):fade + zoom-95,**不位移**(2026-09-09 修:shadcn v3 的 slide-center 在 Tailwind v4 下與置中
 *     translate 相加,變成從左上角飛入;canonical 見 dialog.spec.md「動畫」)
 *   - 邊緣抽屜(Sheet):slide-edge(100%),正當地無 zoom;Sheet 的遮罩與 Dialog / FileViewer 的遮罩同樣吃 surfaceMotion
 * 本 module 統一「何時播 + 時長 + 曲線 + 收尾 + reduced-motion」,不管幾何原型(對齊世界級 tier 分層)。
 * 消費端**只寫幾何**(`data-[state=closed]:fade-out-0` 這類設定 `--tw-enter-*` / `--tw-exit-*` 變數的 class),
 * 不得自己寫 `data-[state=…]:animate-in / animate-out` —— 閘 `scripts/motion-ssot-invariant.mjs`。
 *
 * Easing:進場減速(--motion-easing-enter)/ 出場加速(--motion-easing-exit),由 data-state gate。
 *
 * **「打開」的判準 = 不是 closed(`not-data-[state=closed]`,2026-10-13,待辦總帳 T10)**:Radix 浮層關閉時一律是 `closed`,
 * 打開時卻不一定叫 `open` —— Tooltip 是 `delayed-open`(停留等待後打開)/ `instant-open`(焦點、或剛關掉另一個 Tooltip
 * 隨即移到下一個)(@radix-ui/react-tooltip dist/index.mjs:103-104),其餘(Popover / HoverCard / DropdownMenu / Dialog /
 * Sheet / FileViewer)是 `open`。原本寫 `data-[state=open]`,Tooltip 兩種打開都對不上,進場動畫從來沒播過。
 * 改成「不是 closed」一個判準涵蓋全部打開狀態,權重與原本相同(屬性選擇器一級)。消費端的**進場幾何**(fade-in / zoom-in /
 * slide-in-from)也用同一個判準(`not-data-[state=closed]:fade-in-0`)—— 否則動畫播了、起點變數沒設,看起來還是不動;
 * 閘 `scripts/motion-ssot-invariant.mjs` M1c 擋 `data-[state=open]:` 開頭的進場幾何。
 * 世界級:shadcn Tooltip 進場無條件宣告(`animate-in … fade-in-0 zoom-in-95`,只有收起看 `data-[state=closed]`),
 * 每次打開都播 —— <https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/tooltip.tsx#L29-L33>(2026-10-13 開檔核對)。
 *
 * **打開浮層的觸發點箭頭(2026-10-13,motion.spec.md「開合動畫」同族另見 (3),AI 建議「乙」、user 2026-10-07 採納,原話見 motion.spec.md)**:Select / Combobox / AgentPanel
 * 歷史等觸發點上的展開箭頭,跟它打開的浮層同一個時長(`--motion-duration-overlay`)與同一組曲線 —— 打開那一轉走進場曲線、
 * 收起那一轉走出場曲線,與浮層本體一起開始、一起停(`overlayIndicatorMotion(open)`)。旋轉角度(rotate-180)是幾何,消費端寫。
 *
 * **何時播(2026-10-07,待辦總帳 T7)**:動畫本身只宣告在 `motion-safe:` 底下(= 使用者沒有要求減少動態)。
 * 原本是「動畫無條件宣告 + `motion-reduce:animate-none` 守衛」,守衛的權重 (0,1,0) 永遠輸給
 * `data-[state=open]:animate-in` 的 (0,2,0)(屬性選擇器多一級),不論先後 —— 減少動態設定對全部浮層從來沒有生效過
 * (修前實測:Dialog / Sheet / FileViewer / Popover / HoverCard / DropdownMenu / Tooltip 在 reduce 下照播)。
 * 改成動畫只在 motion-safe 下存在,就沒有權重輸贏可比;reduce 下 Radix Presence 讀到 animation-name: none,當下卸載。
 *
 * **收尾(2026-10-07,待辦總帳 T6)**:關閉狀態保持收起動畫的最後一格(`closed-end-state.ts`),不靠 Radix Presence 的執行期補丁。
 *
 */
import { holdClosedEndState } from './closed-end-state'

// enter=decelerate / exit=accelerate(對齊 Material standard-decelerate/accelerate 曲線);「打開」= 不是 closed(見檔頭)
const EASING =
  'not-data-[state=closed]:[--tw-ease:var(--motion-easing-enter)] data-[state=closed]:[--tw-ease:var(--motion-easing-exit)]'
// 何時播:只在沒有要求減少動態時宣告進出場動畫(見檔頭「何時播」);打開的判準同上
const ENTER_EXIT = 'motion-safe:not-data-[state=closed]:animate-in motion-safe:data-[state=closed]:animate-out'

/** 輕量浮層(Tooltip / Popover / HoverCard / DropdownMenu)— 150ms */
export const overlayMotion = `[--tw-duration:var(--motion-duration-overlay)] ${EASING} ${ENTER_EXIT} ${holdClosedEndState}`

/** 模態面板(Dialog / Sheet / FileViewer,含各自的遮罩)— 250ms(面積大位移遠,慢一階) */
export const surfaceMotion = `[--tw-duration:var(--motion-duration-surface)] ${EASING} ${ENTER_EXIT} ${holdClosedEndState}`

// ── 打開浮層的觸發點箭頭(見檔頭)──────────────────────────────────────────────────────────
// 時長與 overlayMotion 同一個 token;曲線與 EASING 同一組 token(打開 = 進場減速、收起 = 出場加速)。
// 過渡只宣告在 motion-safe 底下(同「何時播」):要求減少動態時箭頭直接換角度,不轉。
const OVERLAY_INDICATOR = 'motion-safe:transition-transform [--tw-duration:var(--motion-duration-overlay)]'
const OVERLAY_INDICATOR_OPEN = `${OVERLAY_INDICATOR} [--tw-ease:var(--motion-easing-enter)]`
const OVERLAY_INDICATOR_CLOSED = `${OVERLAY_INDICATOR} [--tw-ease:var(--motion-easing-exit)]`

/**
 * 打開浮層的觸發點箭頭(Select / Combobox / AgentPanel 歷史 …)— 與浮層同一個時長(150ms)與曲線。
 * `open` 傳觸發點自己的開關狀態;旋轉角度由消費端寫(例:`cn(overlayIndicatorMotion(open), open && 'rotate-180')`)。
 * CSS 過渡用的是「變化之後」那一組曲線,所以打開那一轉吃進場曲線、收起那一轉吃出場曲線,與浮層本體相同。
 */
export const overlayIndicatorMotion = (open: boolean) => (open ? OVERLAY_INDICATOR_OPEN : OVERLAY_INDICATOR_CLOSED)
