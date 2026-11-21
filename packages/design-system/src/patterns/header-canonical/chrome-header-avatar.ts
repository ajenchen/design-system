/**
 * @internal 標頭頭像尺寸的程式對照常數(不經 pattern 的 index 對外匯出;對外名字要 user 定,2026-11-15)。
 *
 * 外框標頭裡的品牌 / 帳號頭像固定 24px(header-canonical.spec.md「4.5 Chrome header avatar SSOT」)。
 * 同一個值有兩個讀者:收合標頭的左內距公式讀 CSS `--chrome-header-avatar-size`(header-canonical.css;Sidebar 讀),
 * 畫頭像的 `<Avatar size={…}>` 要數字 —— 2026-11-15 前 AccountMenu 與範例各寫一份字面值 24,只靠註解維持相等(稽核 P03)。
 * 現在程式端只讀這一個常數,兩邊相等由 scripts/token-twin-invariant.mjs 機器鎖住(改一邊沒改另一邊 → CI 紅)。
 */
export const CHROME_HEADER_AVATAR_PX = 24
