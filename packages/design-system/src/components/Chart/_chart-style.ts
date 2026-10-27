// 圖表範例(展示 / 設計原則 / 設計規格三層)共用的值。底線開頭 = 不進套件出口(gen-design-system-barrel 略過 `_` 開頭檔)。

// 面積圖的填色透明度與外框線寬:值的出處 = chart.spec.md「視覺 token」表「面積圖填色 / 外框線」列(user 2026-10-21 D16 甲)。
// 之前展示頁寫 0.6 / 1px、設計規格頁寫 0.3 / 2px,同一種圖兩套樣式。
export const AREA_FILL_OPACITY = 0.3
export const AREA_STROKE_WIDTH = 2

// 圓餅 / 甜甜圈的進場動畫從第 0 毫秒開始(Recharts Pie 預設 animationBegin = 400,其他圖都是 0)。
// 那 400ms 裡畫面完全不動,「等畫面靜止再截圖」會在動畫開始前就判定靜止,同一份建置重拍兩次結果不同;
// 從 0 開始,動畫每一格都在改 DOM,截圖一定等到畫完。動畫本身(長度、曲線)不變。
export const PIE_ANIMATION_BEGIN = 0
