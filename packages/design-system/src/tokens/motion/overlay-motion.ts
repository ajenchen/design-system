/**
 * Overlay 進出場動畫 — 共用 duration / easing / reduced-motion SSOT(2026-07-11)。
 *
 * 消費 `motion.css` 的 `--motion-*` 動畫 token,經 tw-animate-css 的 `--tw-duration` / `--tw-ease`
 * 變數綁定 → 7 浮層時長/曲線/無障礙守衛單一 SSOT,改 token 一處傳播全部(M17)。
 *
 * 幾何(fade / zoom / slide 距離方向)per-prototype 各自帶:
 *   - 輕量浮層(Tooltip/Popover/HoverCard/DropdownMenu):fade + zoom-95 + slide-side-2(8px)
 *   - 模態面板置中(Dialog/FileViewer):fade + zoom-95 + slide-center
 *   - 邊緣抽屜(Sheet):slide-edge(100%),正當地無 zoom
 * 本 module 只統一「時長 + 曲線 + reduced-motion」,不管幾何原型(對齊世界級 tier 分層)。
 *
 * Easing:進場減速(--motion-easing-enter)/ 出場加速(--motion-easing-exit),由 data-state gate。
 */

// enter=decelerate / exit=accelerate(對齊 Material standard-decelerate/accelerate 曲線)
const EASING =
  'data-[state=open]:[--tw-ease:var(--motion-easing-enter)] data-[state=closed]:[--tw-ease:var(--motion-easing-exit)]'
// prefers-reduced-motion:關進出場動畫(無障礙,7 浮層統一 → 補齊 FileViewer 原缺口)
const REDUCE = 'motion-reduce:animate-none'

/** 輕量浮層(Tooltip / Popover / HoverCard / DropdownMenu)— 150ms */
export const overlayMotion = `[--tw-duration:var(--motion-duration-overlay)] ${EASING} ${REDUCE}`

/** 模態面板(Dialog / Sheet / FileViewer)— 250ms(面積大位移遠,慢一階) */
export const surfaceMotion = `[--tw-duration:var(--motion-duration-surface)] ${EASING} ${REDUCE}`
