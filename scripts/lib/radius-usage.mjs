// ═══════════════════════════════════════════════════════════════════════════
// 圓角照用途 —— 判定的唯一實作(2026-11-15;閘 scripts/radius-usage-invariant.mjs 呼叫)
// ═══════════════════════════════════════════════════════════════════════════
//
// user 2026-11-15:「本來在該使用什麼圓角的時候不就要動腦想看到底怎樣用才符合ds規範嗎？」
// 規則只讀 radius.spec.md「四檔」表(scripts/lib/token-allow-sets.mjs parseRadiusScale);這裡把量到的一個元素
// 判成「合規」或指名違反哪一條。純函式,--selftest 用判定表直接餵。
//
//   R0 不在刻度上:任何一角量到的值不在表上(6px、50%、橢圓雙值…)
//   R1 2px 用在大元素:表上帶「短邊 ≤ Npx」的那一檔,元素短邊 > N
//   R2 浮層外殼的圓角不對:外殼(帶 elevation-200 陰影)應該是「浮層外殼」那一檔;含 role=tooltip 的外殼應該是「Tooltip 外殼」那一檔
//   R3 浮層那一檔用在不是浮層的東西:8px 只給外殼本身,或四角都跟外殼重合的裁切層
//
// 量到的每一角是計算後的字串(getComputedStyle):'0px' / '4px' / '9999px' / '50%' / '4px 6px'(橢圓)。

export const RULE_TEXT = Object.freeze({
  R0: '量到的圓角不在刻度上(radius.spec.md「四檔」只有表上那幾個值)',
  R1: '只給極小指示的那一檔用在短邊超過門檻的元素',
  R2: '浮層外殼的圓角不是表上指定的那一檔',
  R3: '浮層外殼那一檔用在不是浮層外殼的元素(也不是四角跟外殼重合的裁切層)',
})

/** '4px' → 4;'9999px' → 9999;'0px' → 0;其餘(%、橢圓雙值、calc)→ NaN */
export function cornerPx(value) {
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)px$/)
  return m ? Number(m[1]) : NaN
}

/**
 * @param {{ corners: string[], w: number, h: number, surface: boolean, tooltip: boolean, clip: boolean, inherit: boolean }} el
 * @param {{ cls: string, px: number, rule: object }[]} scale  parseRadiusScale 的結果
 * @returns {null | { rule: 'R0'|'R1'|'R2'|'R3', expected: string, got: string }}
 */
export function judgeRadius(el, scale) {
  if (el.inherit) return null // rounded-[inherit]:跟著父層裁切,判父層
  const nonzero = el.corners.filter((c) => String(c).trim() !== '0px')
  if (!nonzero.length && !el.surface) return null
  const allowed = new Set(scale.map((r) => r.px))
  const pxs = nonzero.map(cornerPx)
  const got = [...new Set(el.corners.map((c) => String(c).trim()))].join(' / ')
  if (pxs.some((p) => !allowed.has(p))) return { rule: 'R0', expected: scale.map((r) => `${r.px}px`).join(' / '), got }
  const tier = pxs.length ? Math.max(...pxs) : 0
  const overlayRow = scale.find((r) => r.rule.overlay)
  const tooltipRow = scale.find((r) => r.rule.tooltip)
  const row = scale.find((r) => r.px === tier)
  // 「不限」那一檔(full)任何元素都可以用,浮起來的圓形按鈕(AgentPanel 入口鈕)也是
  if (row?.rule.any) return null
  if (el.surface) {
    // 外殼不圓(0)不判:貼齊視窗邊的抽屜 / 全螢幕檢視器本來就沒有圓角(radius.spec.md「浮層外殼」只管有圓角的外殼)
    if (tier === 0) return null
    const want = el.tooltip ? tooltipRow : overlayRow
    if (tier !== want.px) return { rule: 'R2', expected: `${want.cls}(${want.px}px)`, got }
    return null
  }
  if (!row) return null
  if (row.rule.maxShortSide !== undefined && Math.min(el.w, el.h) > row.rule.maxShortSide) {
    return { rule: 'R1', expected: `短邊 ≤ ${row.rule.maxShortSide}px 才用 ${row.cls};這個元素短邊 ${Math.min(el.w, el.h)}px`, got }
  }
  if (row.rule.overlay && !el.clip) return { rule: 'R3', expected: `${scale.find((r) => r.rule.default).cls}(一般元件)`, got }
  return null
}

/**
 * 例外 / 待決清單的一筆有沒有對到這個元素;對到就回對中的那一個 story 寫法(stories 裡的一項,結尾 * = 開頭相同),沒對到回 null。
 * 呼叫端用回傳值記「這一項用過」—— 清單裡任何一項沒用過 = 過期。
 */
export function entryMatch(entry, story, el) {
  if (entry.rule && entry.rule !== el.violation?.rule) return null
  if (entry.tag && entry.tag !== el.tag) return null
  const classes = new Set(String(el.cls).split(/\s+/))
  if (!(entry.classIncludes ?? []).every((c) => classes.has(c))) return null
  return entry.stories.find((s) => (s.endsWith('*') ? story.startsWith(s.slice(0, -1)) : story === s)) ?? null
}
