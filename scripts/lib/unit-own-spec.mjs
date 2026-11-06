// ═══════════════════════════════════════════════════════════════════════════
// 「這個單元自己的 spec」是哪一份 —— DS 單元資料夾的主 spec 判定(純函式)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼需要這一支**(2026-10-14,待辦總帳 SM2b ①):`category-classification-invariant.mjs` 與
// `check-three-layer-stories.mjs` 都用 `files.find(f => f.endsWith('.spec.md'))` 取「資料夾裡第一個 spec」,
// 把它當成「這個單元的 spec」去讀 frontmatter 的 isInternal。資料夾裡只有一份 spec 時兩者剛好相同;
// a89b6610 把 SelectMenu「不限」那段拆成 `select-menu-unrestricted.spec.md` 之後,按字母序先拿到的是這份
// 沒有 frontmatter 的新檔 → SelectMenu 被判成 public component、7 處分類訊號「不一致」(M37:當下剛好成立的量
// 代替要保證的性質)。同一天盤點:AgentPanel / DataTable / Field / Steps / overlay-surface 也都是「第一個 ≠ 自己的」,
// 只是那幾份第一個 spec 剛好跟主 spec 的 isInternal 一樣,所以沒紅 —— 綠是巧合,不是量對了。
//
// **判準**(沿用 repo 既有的慣例,不另立新規則):
//   1. 與資料夾同名的 spec:`<kebab(資料夾名)>.spec.md`(`scripts/gen-design-system-barrel.mjs` 的 isInternalDir「dir-named spec」——
//      它回答的是同一個問題:這個單元是不是 internal),或與資料夾名逐字相同(`tokens/layoutSpace/layoutSpace.spec.md`);
//   2. 沒有同名的 spec、但資料夾裡只有一份 → 就是它(`compile-stories.mjs` 的 multi-primitive fallback:Menu → menu-item.spec.md);
//   3. 沒有同名、又有兩份以上 → **判不了**(ambiguous),由呼叫端當成失敗,不准挑一份猜。
//   沒有任何 spec → null(呼叫端照舊處理「沒有 spec 的單元」)。

/**
 * `SelectMenu` → `select-menu`;`layoutSpace` → `layout-space`;`element-anatomy` 不變。
 * 與 `scripts/gen-design-system-barrel.mjs` / `scripts/gen-component-indexes.mjs` 的 `pascalToKebab` 逐字同一個公式,
 * 不另立一份:barrel 的 isInternalDir 用它找「dir-named spec」判 internal,跟這裡回答的是同一件事。
 * (`scripts/compile-stories.mjs` 的 toKebab 只在連續大寫的縮寫字頭上不同,例 `UIKit`;目前沒有這種資料夾。)
 */
export function kebabOfUnitDir(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * @param {string} dirName 單元資料夾名(不含路徑),例:`SelectMenu`
 * @param {string[]} files 該資料夾的檔名清單(readdirSync 的結果;順序不影響判定)
 * @returns {{ spec: string|null, reason: 'dir-named'|'only-spec'|'no-spec'|'ambiguous', candidates: string[] }}
 */
export function resolveUnitOwnSpec(dirName, files) {
  const specs = files.filter((f) => f.endsWith('.spec.md')).sort()
  if (specs.length === 0) return { spec: null, reason: 'no-spec', candidates: [] }
  const named = [`${kebabOfUnitDir(dirName)}.spec.md`, `${dirName}.spec.md`].find((f) => specs.includes(f))
  if (named) return { spec: named, reason: 'dir-named', candidates: specs }
  if (specs.length === 1) return { spec: specs[0], reason: 'only-spec', candidates: specs }
  return { spec: null, reason: 'ambiguous', candidates: specs }
}
