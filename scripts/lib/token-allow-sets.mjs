// ═══════════════════════════════════════════════════════════════════════════
// token 允許集合的讀法 —— 「規格表 = 唯一來源」的唯一實作(2026-11-15)
// ═══════════════════════════════════════════════════════════════════════════
//
// user 2026-11-15:「所有要用 token的地方在用的時候本來就要動腦想怎樣才符合ds的SSOT」、
// 「確保ssot 難道不是我們的 token 變成只有sm(2px),md(4px),lg(8px)和full,然後其他不准用？」。
//
// 每一類 token 的允許集合只住在該類規格裡用 `<!-- <id>:start -->` / `<!-- <id>:end -->` 框起來的那一段
// (表格或清單);框裡反引號包住、長得像該類 utility 的字就是允許的名字。這支只負責「讀」:
//   · scripts/token-allowlist-invariant.mjs 拿它比對 utility-registry(hook 讀的那一份)、CSS 宣告與 Tailwind 預設刻度;
//   · scripts/radius-usage-invariant.mjs 拿 parseRadiusScale 的「值 / 機器判定」兩欄在建置好的 Storybook 上量。
// 框不見、框裡讀不到東西、判定詞讀不懂 → 丟 AllowSetError(呼叫端判儀器失效,不讀成通過)。

export class AllowSetError extends Error {}

/** 取規格裡 `<!-- id:start -->` 與 `<!-- id:end -->` 之間的文字;缺一邊或重複 → 丟例外。 */
export function markedBlock(text, id, label = id) {
  const start = `<!-- ${id}:start -->`
  const end = `<!-- ${id}:end -->`
  const s = text.indexOf(start)
  const e = text.indexOf(end)
  if (s < 0 || e < 0 || e < s) throw new AllowSetError(`${label}:讀不到 ${start} … ${end} 這一段(允許集合的唯一來源被拿掉或改名)`)
  if (text.indexOf(start, s + 1) >= 0 || text.indexOf(end, e + 1) >= 0) throw new AllowSetError(`${label}:${id} 的框出現不只一次`)
  return text.slice(s + start.length, e)
}

/** 框裡反引號包住、符合 re 的字(去重、保留出現順序)。 */
export function backtickTokens(block, re) {
  const out = []
  for (const m of block.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim()
    if (re.test(t) && !out.includes(t)) out.push(t)
  }
  return out
}

/** 一段 markdown 表格的資料列(跳過表頭與分隔列),每列切成去掉外框的欄。 */
export function tableRows(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'))
  if (lines.length < 3) return []
  return lines.slice(2).map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
}

const unquote = (cell) => (cell.match(/`([^`]+)`/) ?? [])[1] ?? null

/**
 * 「機器判定」欄的詞彙(radius.spec.md「四檔」下方那張說明表;詞改了這裡要跟著改,否則讀不懂 → 紅)。
 * 回傳每一列的 { cls, token, px, rule },rule 只會是下列其中之一或組合:
 *   maxShortSide(數字)/ default / overlay / tooltip / any
 */
export function parseRadiusScale(specText) {
  const rows = tableRows(markedBlock(specText, 'radius-scale', 'radius.spec.md「四檔」'))
  if (rows.length === 0) throw new AllowSetError('radius.spec.md「四檔」表沒有資料列')
  const scale = rows.map((cells, i) => {
    if (cells.length < 5) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列欄數不足(要 class / token / 值 / 用途 / 機器判定)`)
    const [clsCell, tokenCell, valueCell, , ruleCell] = cells
    const cls = unquote(clsCell)
    const token = unquote(tokenCell)
    const px = Number((valueCell.match(/^(\d+)px$/) ?? [])[1])
    if (!cls || !/^rounded-[a-z0-9]+$/.test(cls)) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列 class 欄讀不懂:${clsCell}`)
    if (!token || !/^--radius-[a-z0-9]+$/.test(token)) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列 token 欄讀不懂:${tokenCell}`)
    if (!Number.isFinite(px) || px <= 0) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列值欄讀不懂(要寫成 Npx):${valueCell}`)
    const rule = {}
    const short = ruleCell.match(/短邊 ≤ (\d+)px/)
    if (short) rule.maxShortSide = Number(short[1])
    if (/其餘/.test(ruleCell)) rule.default = true
    if (/浮層外殼/.test(ruleCell)) rule.overlay = true
    if (/Tooltip 外殼/.test(ruleCell)) rule.tooltip = true
    if (/Tooltip 除外/.test(ruleCell) && !rule.overlay) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列:「Tooltip 除外」只能寫在「浮層外殼」那一列`)
    if (/不限/.test(ruleCell)) rule.any = true
    if (!Object.keys(rule).length) throw new AllowSetError(`radius.spec.md「四檔」第 ${i + 1} 列機器判定讀不懂:${ruleCell}(認得的詞:短邊 ≤ Npx / 其餘 / 浮層外殼 / Tooltip 外殼 / 不限)`)
    return { cls, token, px, rule }
  })
  const one = (key, word) => {
    const hits = scale.filter((r) => r.rule[key])
    if (hits.length !== 1) throw new AllowSetError(`radius.spec.md「四檔」:「${word}」要剛好一列,實得 ${hits.length} 列`)
    return hits[0]
  }
  one('default', '其餘')
  one('overlay', '浮層外殼')
  one('tooltip', 'Tooltip 外殼')
  if (new Set(scale.map((r) => r.px)).size !== scale.length) throw new AllowSetError('radius.spec.md「四檔」:兩列同值 —— 同值兩個名字就是 2026-11-15 前 sm = md 的那種別名')
  return scale
}

/** radius.spec.md「唯一的 bracket 寫法」那一段的 class(rounded-[inherit])。 */
export function parseRadiusPassthrough(specText) {
  return backtickTokens(markedBlock(specText, 'radius-passthrough', 'radius.spec.md「唯一的 bracket 寫法」'), /^rounded-\[[a-z]+\]$/)
}

/**
 * 各類規格的允許集合(類 → { spec, blocks, re })。scripts/token-allowlist-invariant.mjs 逐類比對 utility-registry 的 allow。
 * 新一類 token 有允許集合 → 在這裡加一列,並在該類規格框出那一段。
 */
export const ALLOW_SET_SOURCES = Object.freeze({
  radius: { spec: 'packages/design-system/src/tokens/radius/radius.spec.md', blocks: ['radius-scale', 'radius-passthrough'], re: /^rounded-(?:[a-z0-9]+|\[[a-z]+\])$/ },
  typography: {
    spec: 'packages/design-system/src/tokens/typography/typography.spec.md',
    blocks: ['typography-allow-size', 'typography-allow-weight', 'typography-allow-leading', 'typography-allow-tracking'],
    re: /^(?:text|font|leading|tracking)-[a-z0-9-]+$/,
  },
  opacity: { spec: 'packages/design-system/src/tokens/opacity/opacity.spec.md', blocks: ['opacity-scale'], re: /^opacity-[a-z0-9-]+$/ },
  elevation: {
    spec: 'packages/design-system/src/tokens/elevation/elevation.spec.md',
    blocks: ['elevation-scale'],
    re: /^--elevation-[a-z0-9-]+$/,
    // 規格寫 token,允許清單寫 class:shadow-[var(token)](elevation.spec.md 開頭的寫法)
    toClass: (token) => `shadow-[var(${token})]`,
  },
})

/** 某一類規格框起來的允許集合(已轉成 class)。 */
export function specAllowSet(category, specText) {
  const src = ALLOW_SET_SOURCES[category]
  if (!src) throw new AllowSetError(`沒有這一類:${category}`)
  const out = []
  for (const id of src.blocks) {
    const tokens = backtickTokens(markedBlock(specText, id, `${src.spec}「${id}」`), src.re)
    if (!tokens.length) throw new AllowSetError(`${src.spec}「${id}」框裡讀不到任何 ${src.re} 的名字`)
    for (const t of tokens) {
      const cls = src.toClass ? src.toClass(t) : t
      if (!out.includes(cls)) out.push(cls)
    }
  }
  return out
}
