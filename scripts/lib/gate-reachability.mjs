/**
 * 「這支閘的判定,執行面真的有呼叫嗎」——**只數呼叫點**。
 *
 * 2026-09-21 同一個檢查被收緊三次才對:
 *   v1 `src.includes('fn(')`      → **import 那一行也命中**,拿掉呼叫點照樣綠
 *   v2 排除 import                → **註解也命中**,還是綠
 *   v3 再排除註解                 → 才真的會紅
 * 而姊妹測試(hover)一直停在 v1 —— 所以抽成共用的一支,不要再各寫一份。
 */
export function countCallSites(source, name) {
  const re = new RegExp(`${name}\\s*\\(`)
  return source.split('\n')
    .filter((line) => !/^\s*import\b/.test(line))          // import 宣告
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))    // 整行註解 / JSDoc
    .filter((line) => re.test(line))
    .length
}
