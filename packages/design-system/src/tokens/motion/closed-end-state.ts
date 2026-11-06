/**
 * 開合動畫的收尾:關閉後的樣子由 CSS 保持(2026-10-07,待辦總帳 T6)。
 *
 * **為什麼需要**:Radix 的開合元件(Collapsible / Accordion / Dialog / Popover / Tooltip / HoverCard / DropdownMenu)
 * 關閉時先把 `data-state` 改成 `closed`、等收起動畫的 `animationend`,**之後**才由 React 重畫把內容卸載或加上 `hidden`。
 * tw-animate-css 的動畫工具類填充模式是 `var(--tw-animation-fill-mode, none)` —— 動畫最後一格一結束,元素就回到
 * 自然的樣子(收合內容回到原本高度、浮層回到不透明)。中間那一格不閃,原本**只**靠 Radix Presence 在 animationend
 * 處理器裡臨時寫上 inline `animation-fill-mode: forwards`、再用 setTimeout 撤掉(@radix-ui/react-presence 1.1.5
 * `dist/index.mjs:76-91`;原始碼註解自己寫「creating a flash of visible content」)。那個補丁成立的前提是 JS 收尾
 * 跟得上 CSS 動畫時鐘;跟不上的環境就會整段長回來一格以上(待辦總帳 T6「收合時子項閃一下才消失」—— 總帳的描述,不是 user 原話)。
 *
 * **做法**:關閉狀態一律宣告 `fill-mode-forwards`(tw-animate-css 的工具類,同時設 `animation-fill-mode` 與
 * `--tw-animation-fill-mode`)—— 收起動畫的最後一格(高度 0 / 透明)變成 CSS 狀態,一直保持到元素被卸載或隱藏,
 * 與 JS 何時收尾無關。只掛在 closed:打開的那一段若也 forwards,高度會被鎖在量到的像素,內容之後再變高就長不出來。
 *
 * 世界級沒有一家把收合終態只交給「動畫最後一格 + JS 補丁」:MUI Collapse 收完寫 inline `height: collapsedSize`
 * + `visibility: hidden`;Ant 收合目標值寫在 inline style;PatternFly 以 transition-delay 等淡出結束才切 `visibility:hidden`;
 * Primer / Carbon / W3C APG 樹直接不做收合動畫(原始碼連結見 motion.spec.md「開合動畫:何時播、怎麼收尾」)。
 *
 * 消費者只有同目錄的兩份開合動畫 SSOT(`overlay-motion.ts` 的 overlayMotion / surfaceMotion、`disclosure-motion.ts`
 * 的 disclosureMotion);元件不直接用它 —— 閘 `scripts/motion-ssot-invariant.mjs` 擋「SSOT 以外宣告開合動畫」。
 */

/** @internal 關閉狀態保持收起動畫的最後一格(只給 tokens/motion 底下的開合動畫 SSOT 組字串用)。 */
export const holdClosedEndState = 'data-[state=closed]:fill-mode-forwards'
