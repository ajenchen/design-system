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
 * **何時播(2026-10-07,待辦總帳 T7)**:動畫本身只宣告在 `motion-safe:` 底下(= 使用者沒有要求減少動態)。
 * 原本是「動畫無條件宣告 + `motion-reduce:animate-none` 守衛」,守衛的權重 (0,1,0) 永遠輸給
 * `data-[state=open]:animate-in` 的 (0,2,0)(屬性選擇器多一級),不論先後 —— 減少動態設定對全部浮層從來沒有生效過
 * (修前實測:Dialog / Sheet / FileViewer / Popover / HoverCard / DropdownMenu / Tooltip 在 reduce 下照播)。
 * 改成動畫只在 motion-safe 下存在,就沒有權重輸贏可比;reduce 下 Radix Presence 讀到 animation-name: none,當下卸載。
 *
 * **收尾(2026-10-07,待辦總帳 T6)**:關閉狀態保持收起動畫的最後一格(`closed-end-state.ts`),不靠 Radix Presence 的執行期補丁。
 *
 * **Tooltip 的打開狀態不是 `open`**:Radix Tooltip 的 data-state 是 `delayed-open` / `instant-open` / `closed`
 * (@radix-ui/react-tooltip dist/index.mjs:103-104),所以這裡 `data-[state=open]` 的進場對 Tooltip 不成立 ——
 * Tooltip 打開從來沒有播過進場動畫(關閉的收起動畫照常)。要不要補、補 delayed-open 還是兩種都補,是看得見的取捨,
 * 本次不改(motion.spec.md「開合動畫」段「同族另見」(1),已回報待辦總帳)。
 */
import { holdClosedEndState } from './closed-end-state'

// enter=decelerate / exit=accelerate(對齊 Material standard-decelerate/accelerate 曲線)
const EASING =
  'data-[state=open]:[--tw-ease:var(--motion-easing-enter)] data-[state=closed]:[--tw-ease:var(--motion-easing-exit)]'
// 何時播:只在沒有要求減少動態時宣告進出場動畫(見檔頭「何時播」)
const ENTER_EXIT = 'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out'

/** 輕量浮層(Tooltip / Popover / HoverCard / DropdownMenu)— 150ms */
export const overlayMotion = `[--tw-duration:var(--motion-duration-overlay)] ${EASING} ${ENTER_EXIT} ${holdClosedEndState}`

/** 模態面板(Dialog / Sheet / FileViewer,含各自的遮罩)— 250ms(面積大位移遠,慢一階) */
export const surfaceMotion = `[--tw-duration:var(--motion-duration-surface)] ${EASING} ${ENTER_EXIT} ${holdClosedEndState}`
