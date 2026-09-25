#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 同一個元素的 class 組合裡,滑過時換上的底色 token 必須是「這個元素自己靜止底色」的配對 ——
 *         靜止底是 token(不透明或半透明都算)就換成那個底自己的 `-hover`(同一條色階的下一階);靜止底透明才用 `--neutral-hover`;
 *         釘住(滑過仍是靜止值)也合法;借用別的底的配對、或換到根本不是配對的 token → 紅。配對表每次從 semantic.css 現讀,不寫死
 *   紅: --selftest 把 026d5788 之前的 Calendar 非當月格原文(`!inMonth && 'bg-muted'` + `'hover:bg-neutral-hover'`)餵進去必須指名 bg-muted 紅;
 *       另有「白卡片借透明底配對」「已按下切換鈕借透明底配對(2026-09-07 案)」「滑過換到 -active」「分隔線借 --border 的配對」
 *       「巢狀 hover 借透明底配對」「CSS :hover 借用」等合成違規,各自必須指名紅
 *   綠: 現行 calendar.tsx 同一段必須 0 筆;selftest 的合法寫法(配對、釘住、選中列以 !selected 守衛排除、三元互斥分支、cva 不同 variant 互斥、
 *        twMerge 後寫者勝、色相 hover 配 step-6、巢狀 hover 沿用同一對、區域變數不判、帶透明度修飾不判)必須全部 0 筆;
 *        全樹掃描判到 0 組 = 儀器失效(紅),不讀成通過;純靜態分析、不讀時間也不開瀏覽器,重複跑結果相同
 */
// ═══════════════════════════════════════════════════════════════════════════
// hover 換色配對不變條件 —— 「滑過時換上的,必須是自己靜止底色的那一對」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/src/tokens/color/color.spec.md`「Hover 換色配對總則」(階梯表旁)
//       + 同檔「架構流派定位」(:10-16 選 Atlassian / Primer 的換色流派、明文拒絕 Material 3 疊層)。
//
// 為什麼需要(2026-09-25):Calendar 非當月格靜止是 `bg-muted`(4%),滑過卻換成透明底專用的
// `--neutral-hover`(2%)—— 兩個主題都**反向**(淺 #F5F5F5→#FAFAFA 變淺、深 #2F2F2F→#262626 變暗)。
// 單看任何一個 class 都沒錯,錯在「這一對不是同一個底的配對」;而 2026-09-07 已按下切換鈕的 bug 是同一個形狀
// (已按下的底色是 neutral-2,滑過值卻撞到透明底的 neutral-1,按下與未按下在滑過時像素完全相同)。
// 026d5788 修掉 Calendar 之後,沒有任何機械面會在下一次有人把可點元素放到 token 底上、又順手寫
// `hover:bg-neutral-hover` 時紅 —— 這支就是那道防線。
//
// 判準(機械):
//   1. 配對表從 semantic.css 現讀:每個 `--X-hover` 的「底」=
//        (a) `--X` 有定義 → `--X`(例:--primary-hover → --primary、--border-hover → --border、
//            --surface-strong-hover → --surface-strong、--scrollbar-thumb-hover → --scrollbar-thumb、
//            --neutral-selected-hover → --neutral-selected);
//        (b) 淺色值是 `var(--color-X-5)` → 底是 `--color-X-6`(色相 hover = step-5,color.spec.md「互動狀態推導」);
//        (c) 都不是 → 底是「透明」(--neutral-hover、--inverse-neutral-hover)。
//   2. 「同一個元素」= 同一段 class 組合:同一個字串、或 cn()/clsx()/twMerge()/cva() 的同一次呼叫、同一個陣列;
//      cva 的不同 variant 值、三元的兩個分支、`x && …` 與 `!x && …` 視為互斥,不會湊成一對;
//      同一個變體前綴後寫的蓋掉先寫的(twMerge 語意)。
//   3. 滑過類前綴:hover / group-hover / data-[hovered] 等 JS 代理標記 / data-[highlighted] / data-[state=open](浮層開著 = host hover,
//      inline-action.spec.md)/ 任意變體裡帶 `:hover` 的(巢狀 hover 的 `[&:where(:has(~…:hover))]`、`[@media(hover:hover)]`)。
//      把這些前綴拿掉之後剩下的前綴(例 `data-[state=on]:`、`[&>button]:`)就是「同一個狀態下的靜止底」。
//   4. 只判底色(bg)。文字與邊框的滑過不在本閘範圍。
//
// 不判(會印出件數,不當成通過):靜止底或滑過值是區域 CSS 變數(例 Tag 的 --dismiss-hover)、帶透明度修飾
//(例 Carousel 圓點 `bg-on-emphasis/60`,底色換不掉的圖片疊層,carousel.spec.md 有明文)、任意色值;
// 以及組合裡看不到靜止底、滑過值又不是透明底配對的情形(靜止底寫在別的變數裡,靜態分析看不到)。
//
// 已知、待 user 拍板的命中登記在 `scripts/hover-own-pair-baseline.json`(每筆附理由,每次執行都會印出),
// 新增的命中一律紅。
//
// Run: `node scripts/hover-own-pair-invariant.mjs`(`--selftest` 跑正反例;`--verbose` 印出看不到靜止底的清單;`--list` 印出每一組判定;
//       `--file=<path>` 只掃一個檔(可搭 `--stdin` 從標準輸入讀內容,用來驗歷史版本)、`--no-baseline` 不套已知清單)
import ts from 'typescript'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(REPO, 'packages/design-system/src')
const SEMANTIC_CSS = join(SRC, 'tokens/color/semantic.css')
const PRIMITIVES_CSS = join(SRC, 'tokens/color/primitives.css')
const BASELINE = join(REPO, 'scripts/hover-own-pair-baseline.json')

// ── 配對表(從 semantic.css / primitives.css 現讀)──────────────────────────────

/** 取出 CSS 內所有 `--name: value;` 定義(同名多處時保留第一個 = 淺色 / 預設值) */
function readDefinitions(css) {
  const out = new Map()
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of stripped.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim())
  }
  return out
}

/** `@theme inline { --color-NAME: var(--TOKEN) }` → utility 色名 NAME → token --TOKEN */
function readBridge(css) {
  const bridge = new Map()
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const block of stripped.matchAll(/@theme(?:\s+inline)?\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/--color-([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
      const target = m[2].trim().match(/^var\((--[A-Za-z0-9_-]+)\)$/)
      bridge.set(m[1], target ? target[1] : `--color-${m[1]}`)
    }
  }
  return bridge
}

/**
 * @param {string} semanticCss
 * @param {string} primitivesCss
 * @returns {{ defined: Set<string>, bridge: Map<string,string>, pairs: Map<string,string> }}
 *   pairs:hover token → 它的底(token 名,或 'transparent')
 */
export function readPairTable(semanticCss, primitivesCss) {
  // `@theme inline` 裡的 `--color-X-hover: var(--X-hover)` 是 Tailwind 橋接別名,不是第二組 token(token-system.spec.md)——
  // 配對表只看真正的定義,橋接另外讀成 utility 色名 → token 的對照
  const withoutTheme = (css) => css.replace(/@theme(?:\s+inline)?\s*\{[^}]*\}/g, '')
  const semantic = readDefinitions(withoutTheme(semanticCss))
  const primitive = readDefinitions(withoutTheme(primitivesCss))
  const defined = new Set([...semantic.keys(), ...primitive.keys()])
  const bridge = new Map([...readBridge(primitivesCss), ...readBridge(semanticCss)])
  const pairs = new Map()
  for (const [name, value] of semantic) {
    const m = name.match(/^--(.+)-hover$/)
    if (!m) continue
    const stem = m[1]
    if (semantic.has(`--${stem}`)) pairs.set(name, `--${stem}`)
    else if (value === `var(--color-${stem}-5)` && primitive.has(`--color-${stem}-6`)) pairs.set(name, `--color-${stem}-6`)
    else pairs.set(name, 'transparent')
  }
  return { defined, bridge, pairs }
}

// ── class 解析 ──────────────────────────────────────────────────────────────

/** 滑過類前綴(拿掉之後剩下的前綴 = 「同一狀態下的靜止」) */
const HOVERISH = [
  /^hover$/, /^group-hover(?:\/[\w-]+)?$/, /^peer-hover(?:\/[\w-]+)?$/,
  // data-[hovered] / data-[action-hover](JS 代理的滑過標記,DataTable 列、Tabs 分頁的巢狀 hover)
  /^(?:group-)?data-\[[\w-]*hover[\w-]*(?:=[^\]]*)?\](?:\/[\w-]+)?$/,
  /^data-\[highlighted\]$/, /^group-data-\[highlighted\](?:\/[\w-]+)?$/,
  /^data-\[state=open\]$/, /^group-data-\[state=open\](?:\/[\w-]+)?$/,
  // 任意變體裡帶 :hover 的(`[&:hover]`、巢狀 hover 的 `[&:where(:has(~…:hover))]`)與 `[@media(hover:hover)]` 媒體條件
  /^\[.*:hover.*\]$/,
]
const isHoverish = (seg) => HOVERISH.some((re) => re.test(seg))

/** 依 `:` 切變體前綴,略過 [] 與 () 內的冒號 */
function splitVariants(cls) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of cls) {
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ':' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts
}

/**
 * 解析一個 class。回 null = 不是底色 class。
 * @returns {{ raw:string, segs:string[], hoverish:boolean, rest:string[], token:string|null, kind:'token'|'transparent'|'unknown' }}
 */
function parseBgClass(cls, table) {
  const parts = splitVariants(cls)
  let util = parts.pop()
  if (!util) return null
  util = util.replace(/^!/, '').replace(/!$/, '')
  if (!util.startsWith('bg-')) return null
  const name = util.slice(3)
  const segs = parts.filter(Boolean)
  const hoverish = segs.some(isHoverish)
  const rest = segs.filter((s) => !isHoverish(s)).sort()
  let token = null, kind = 'unknown'
  if (name === 'transparent') { kind = 'transparent' }
  else if (name.includes('/')) { kind = 'unknown' }                          // 帶透明度修飾:底色換不掉的疊層(不判)
  else if (name.startsWith('[')) {
    const v = name.match(/^\[var\((--[A-Za-z0-9_-]+)(?:,[^\]]*)?\)\]$/)
    if (v && table.defined.has(v[1])) { token = v[1]; kind = 'token' }       // 未定義 = 區域變數(不判)
    else if (!v) return null                                                 // 任意值(長度 / url / 色碼)
  } else if (table.bridge.has(name)) { token = table.bridge.get(name); kind = 'token' }
  else return null                                                           // bg-clip-*、bg-cover 等非色彩 utility
  return { raw: cls, segs, hoverish, rest, token, kind }
}

// ── 條件(守衛)——判斷兩段 class 會不會同時出現 ─────────────────────────────

const norm = (node, sf) => node.getText(sf).replace(/\s+/g, '')
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression
  return node
}
/** 條件運算式 → 原子陣列(成立時)。只拆 `&&`、`!`、`===`/`!==` 字面值;其餘整段當一個原子 */
function atomsOf(cond, sf, pol = true) {
  cond = unwrap(cond)
  if (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) return atomsOf(cond.operand, sf, !pol)
  if (pol && ts.isBinaryExpression(cond) && cond.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...atomsOf(cond.left, sf, true), ...atomsOf(cond.right, sf, true), { expr: norm(cond, sf), pol: true }]
  }
  if (ts.isBinaryExpression(cond)) {
    const op = cond.operatorToken.kind
    const eq = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken
    const ne = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken
    const lit = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text
      : n.kind === ts.SyntaxKind.TrueKeyword ? 'true' : n.kind === ts.SyntaxKind.FalseKeyword ? 'false' : null
    if (eq || ne) {
      const r = lit(unwrap(cond.right)), l = lit(unwrap(cond.left))
      if (r !== null) return [{ expr: norm(cond.left, sf), eqVal: r, pol: eq ? pol : !pol }]
      if (l !== null) return [{ expr: norm(cond.right, sf), eqVal: l, pol: eq ? pol : !pol }]
    }
  }
  return [{ expr: norm(cond, sf), pol }]
}
const sameAtom = (a, b) => a.expr === b.expr && a.eqVal === b.eqVal && a.pol === b.pol
function conflicts(a, b) {
  if (a.expr !== b.expr) return false
  if (a.eqVal === undefined && b.eqVal === undefined) return a.pol !== b.pol
  if (a.eqVal !== undefined && b.eqVal !== undefined) {
    if (a.eqVal === b.eqVal) return a.pol !== b.pol
    return a.pol && b.pol                                                    // 同一個值不可能同時等於兩個不同字面值
  }
  return false
}
const exclusive = (ga, gb) => ga.some((a) => gb.some((b) => conflicts(a, b)))
const implied = (g, scenario) => g.every((a) => scenario.some((b) => sameAtom(a, b)))

// ── 「同一個元素」的範圍 ─────────────────────────────────────────────────────

const CLASS_FNS = new Set(['cn', 'clsx', 'cx', 'twMerge', 'twJoin', 'classNames', 'cva'])
const calleeName = (call) => {
  const e = call.expression
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''
}
const propName = (p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) ? p.name.text
  : p.name && p.name.kind === ts.SyntaxKind.TrueKeyword ? 'true' : null

/**
 * 從字串往上爬,每一步可選擇性地收集條件原子。回傳最後停下的節點與沿路的原子。
 * `stopAt`:爬到這個節點就停(用來算「相對於某個範圍」的守衛)。
 */
function climb(node, sf, stopAt = null) {
  const atoms = []
  let cur = node
  for (;;) {
    if (cur === stopAt) return { root: cur, atoms, reached: true }
    const p = cur.parent
    if (!p) break
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression?.(p) || ts.isNonNullExpression(p) || ts.isSpreadElement(p) || ts.isArrayLiteralExpression(p)) { cur = p; continue }
    if (ts.isTemplateSpan(p)) { cur = p.parent; continue }
    if (ts.isConditionalExpression(p) && cur !== p.condition) {
      atoms.push(...atomsOf(p.condition, sf, cur === p.whenTrue))
      cur = p; continue
    }
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) { if (cur === p.right) atoms.push(...atomsOf(p.left, sf, true)); cur = p; continue }
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.PlusToken) { cur = p; continue }
      break
    }
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && p.name.text === 'join' && p.parent && ts.isCallExpression(p.parent)) { cur = p.parent; continue }
    if (ts.isCallExpression(p) && p.arguments.includes(cur) && CLASS_FNS.has(calleeName(p))) { cur = p; continue }
    // cva 設定物件:variants.{prop}.{value} 與 compoundVariants[i].class 換成條件原子後,接回 cva 呼叫
    if (ts.isPropertyAssignment(p) && p.initializer === cur) {
      const hop = cvaHop(p, sf)
      if (hop) { atoms.push(...hop.atoms); cur = hop.call; continue }
    }
    break
  }
  return { root: cur, atoms, reached: stopAt === null }
}

function cvaHop(prop, sf) {
  const obj = prop.parent
  if (!ts.isObjectLiteralExpression(obj)) return null
  // variants: { size: { sm: '...' } }
  const valueName = propName(prop)
  const outer = obj.parent
  if (valueName !== null && outer && ts.isPropertyAssignment(outer) && outer.initializer === obj) {
    const variantsObj = outer.parent
    const variantsProp = variantsObj && variantsObj.parent
    if (variantsProp && ts.isPropertyAssignment(variantsProp) && propName(variantsProp) === 'variants') {
      const config = variantsProp.parent
      const call = config && config.parent
      if (call && ts.isCallExpression(call) && calleeName(call) === 'cva' && call.arguments[1] === config) {
        return { call, atoms: [{ expr: `cva:${propName(outer)}`, eqVal: valueName, pol: true }] }
      }
    }
  }
  // compoundVariants: [{ variant: 'x', danger: true, class: [...] }]
  const key = propName(prop)
  if ((key === 'class' || key === 'className') && obj.parent && ts.isArrayLiteralExpression(obj.parent)) {
    const cvProp = obj.parent.parent
    if (cvProp && ts.isPropertyAssignment(cvProp) && propName(cvProp) === 'compoundVariants') {
      const config = cvProp.parent
      const call = config && config.parent
      if (call && ts.isCallExpression(call) && calleeName(call) === 'cva' && call.arguments[1] === config) {
        const atoms = []
        for (const other of obj.properties) {
          if (other === prop || !ts.isPropertyAssignment(other)) continue
          const v = unwrap(other.initializer)
          const val = ts.isStringLiteral(v) ? v.text : v.kind === ts.SyntaxKind.TrueKeyword ? 'true' : v.kind === ts.SyntaxKind.FalseKeyword ? 'false' : null
          if (val !== null) atoms.push({ expr: `cva:${propName(other)}`, eqVal: val, pol: true })
        }
        return { call, atoms }
      }
    }
  }
  return null
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
  return null
}

// ── 判定 ────────────────────────────────────────────────────────────────────

/** 反查:某個底的配對是誰(給修法提示用) */
const ownPairOf = (table, base) => [...table.pairs].filter(([, b]) => b === base).map(([h]) => h)
const show = (c) => c.kind === 'transparent' ? '透明' : c.token

/**
 * 一對 (滑過值 T, 靜止值 R) 的判定。
 * @returns {{ ok: boolean, why?: string, skip?: boolean }}
 */
export function judgePair(T, R, table) {
  if (T.kind === 'unknown' || R.kind === 'unknown') return { ok: true, skip: true }
  if (T.kind === R.kind && T.token === R.token) return { ok: true }                         // 釘住 / 重設
  if (T.kind === 'transparent') return { ok: false, why: '滑過把靜止底色拿掉(換成透明)' }
  const base = table.pairs.get(T.token)
  const restName = show(R)
  const own = R.kind === 'transparent' ? ownPairOf(table, 'transparent') : ownPairOf(table, R.token)
  const hint = own.length ? `;${restName}自己的配對是 ${own.join(' / ')}`
    : `;${restName} 沒有 hover 配對 token${R.token === '--muted' ? '(--muted 是「靜態非互動」底色,color.spec.md Static Subtle 段:可點的東西不該站在它上面)' : ''}`
  if (base === undefined) return { ok: false, why: `滑過換到 ${T.token},它不是任何底色的 hover 配對${hint}` }
  if (base === 'transparent' && R.kind === 'transparent') return { ok: true }
  if (base === R.token) return { ok: true }
  return { ok: false, why: `${T.token} 是${base === 'transparent' ? '透明底' : ` ${base} `}的配對,這個元素的靜止底是 ${restName}${hint}` }
}

const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1

/** 掃一段 tsx / ts 原始碼 */
export function scanSource(source, path, table) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
  const literals = []
  const visit = (n) => {
    const text = literalText(n)
    if (text !== null && /(?:^|[\s:!])bg-/.test(text)) literals.push(n)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const classesOf = new Map(literals.map((l) => [l, literalText(l).split(/\s+/).filter(Boolean).map((c) => parseBgClass(c, table)).filter(Boolean)]))
  const violations = [], unresolved = [], skipped = [], evaluated = []
  const seen = new Set()

  for (const L of literals) {
    const hovers = classesOf.get(L).filter((c) => c.hoverish)
    if (!hovers.length) continue
    const { root } = climb(L, sf)
    // 範圍內每一段字串 + 它相對於範圍根的守衛
    const members = []
    for (const M of literals) {
      if (M.pos < root.pos || M.end > root.end) continue
      const r = climb(M, sf, root)
      if (!r.reached) continue                                                // 範圍內但不屬於同一段 class 組合(例:別的函式呼叫的參數)
      members.push({ node: M, guard: r.atoms, classes: classesOf.get(M), order: M.pos })
    }
    const self = members.find((m) => m.node === L)
    if (!self) continue
    const key = (c) => [...c.segs].sort().join(':')
    // 在情境 scenario 下,某個變體前綴 k 實際生效的 class(twMerge:確定成立的字串裡,後寫者勝)
    const effective = (k, scenario) => {
      let winner = null
      for (const m of members) {
        if (!implied(m.guard, scenario)) continue
        for (const c of m.classes) if (key(c) === k && (!winner || m.order >= winner.order)) winner = { c, order: m.order }
      }
      return winner && winner.c
    }
    for (const H of hovers) {
      const want = new Set(H.rest)
      const restCands = []
      for (const m of members) {
        if (exclusive(m.guard, self.guard)) continue
        for (const c of m.classes) {
          if (c.hoverish || !c.segs.every((s) => want.has(s))) continue
          restCands.push({ c, m })
        }
      }
      const evaluate = (R, scenario, restLine) => {
        if (effective(key(H), scenario) !== H) return                        // 這個情境下 H 被後寫的蓋掉,由那一條負責
        const verdict = judgePair(H, R, table)
        const id = `${H.raw}|${show(R)}|${lineOf(sf, L.getStart(sf))}`
        if (seen.has(id)) return
        seen.add(id)
        evaluated.push({ path, line: lineOf(sf, L.getStart(sf)), hover: H.raw, rest: R.raw || '(透明)', verdict: verdict.skip ? '不判' : verdict.ok ? '✓' : '✗' })
        if (verdict.skip) { skipped.push({ path, line: lineOf(sf, L.getStart(sf)), hover: H.raw }); return }
        if (!verdict.ok) violations.push({ path, line: lineOf(sf, L.getStart(sf)), hover: H.raw, rest: R.kind === 'transparent' && !R.raw ? '(沒有底色 = 透明)' : R.raw, restLine, why: verdict.why })
      }
      let anyDefinite = false
      for (const cand of restCands) {
        const { c, m } = cand
        const scenario = [...self.guard, ...m.guard]
        // 這個情境下確定成立、而且更具體(前綴更多)或同前綴後寫的靜止底會蓋掉 c(CSS 特異性 / twMerge)
        const shadowed = restCands.some((o) => o !== cand && implied(o.m.guard, scenario)
          && (o.c.segs.length > c.segs.length || (o.c.segs.length === c.segs.length && key(o.c) === key(c) && o.m.order > m.order)))
        if (shadowed) continue
        if (implied(m.guard, self.guard)) anyDefinite = true
        evaluate(c, scenario, lineOf(sf, m.node.getStart(sf)))
      }
      if (!anyDefinite) {
        // 沒有確定成立的靜止底 → 這個元素至少在某些情況下是透明底
        const base = H.kind === 'token' ? table.pairs.get(H.token) : undefined
        if (!restCands.length && base !== undefined && base !== 'transparent') {
          // 組合裡完全看不到靜止底、滑過值又是實心家族的配對:靜止底多半寫在別的變數裡 ——
          // 靜態看不到,不判,但也不當成通過(件數照印,--verbose 列出)
          unresolved.push({ path, line: lineOf(sf, L.getStart(sf)), hover: H.raw })
        } else {
          evaluate({ kind: 'transparent', token: null, raw: '' }, self.guard, null)
        }
      }
    }
  }
  return { violations, unresolved, skipped, evaluated }
}

/** 掃 CSS:`sel:hover { background(-color): var(--T) }` 對照同一個 selector 的靜止底 */
export function scanCss(css, path, table) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const rules = []
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const bg = m[2].match(/background(?:-color)?\s*:\s*([^;]+);?/)
    if (!bg) continue
    const v = bg[1].trim().match(/^var\((--[A-Za-z0-9_-]+)\)$/)
    const val = bg[1].trim() === 'transparent' ? { kind: 'transparent', token: null } : v && table.defined.has(v[1]) ? { kind: 'token', token: v[1] } : { kind: 'unknown', token: null }
    const line = stripped.slice(0, m.index + m[0].indexOf('{')).split('\n').length
    for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) rules.push({ sel, val, line })
  }
  const violations = [], skipped = [], evaluated = []
  const HOVER_SEL = /:hover\b|\[data-hovered(?:=[^\]]*)?\]|\[data-highlighted\]/g
  for (const r of rules) {
    if (!r.sel.match(HOVER_SEL)) continue
    const restSel = r.sel.replace(HOVER_SEL, '').trim()
    const rest = rules.filter((x) => x.sel === restSel).pop()
    const R = rest ? { ...rest.val, raw: `${restSel} { background }` } : { kind: 'transparent', token: null, raw: '' }
    const verdict = judgePair({ ...r.val, raw: r.sel }, R, table)
    evaluated.push({ path, line: r.line, hover: r.sel, rest: R.raw || '(透明)', verdict: verdict.skip ? '不判' : verdict.ok ? '✓' : '✗' })
    if (verdict.skip) skipped.push({ path, line: r.line, hover: r.sel })
    else if (!verdict.ok) violations.push({ path, line: r.line, hover: r.sel, rest: R.raw || '(沒有底色 = 透明)', restLine: rest ? rest.line : null, why: verdict.why })
  }
  return { violations, unresolved: [], skipped, evaluated }
}

// ── 全樹掃描 + 已知清單 ──────────────────────────────────────────────────────

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out) }
    else if (/\.(tsx|ts|css)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

export function scanFile(abs, table, content = readFileSync(abs, 'utf8')) {
  const rel = relative(SRC, abs).split('\\').join('/')
  return extname(abs) === '.css' ? scanCss(content, rel, table) : scanSource(content, rel, table)
}

export const baselineKey = (v) => `${v.path}|${v.hover}|${v.rest}`

export function loadTable() {
  return readPairTable(readFileSync(SEMANTIC_CSS, 'utf8'), readFileSync(PRIMITIVES_CSS, 'utf8'))
}

// ── selftest ────────────────────────────────────────────────────────────────

/** 026d5788^ 的 calendar.tsx 原文(:535-547,非當月格那一段,逐字;`git show 026d5788^:packages/design-system/src/components/Calendar/calendar.tsx`)—— 對照組的主角 */
export const CALENDAR_BEFORE_026D5788 = `
                <div
                  key={date.toISOString()}
                  role="gridcell"
                  onClick={() => onDateClick?.(date)}
              className={cn(
                'flex flex-col gap-1 min-h-28 p-1.5 text-left',
                'border-r border-b border-divider last:border-r-0',
                '[&:nth-child(7n)]:border-r-0',
                // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
                'hover:bg-neutral-hover',
                !inMonth && 'bg-muted',
              )}
            >
            </div>
`
/** 026d5788 之後同一段(拿掉 bg-muted) */
export const CALENDAR_AT_026D5788 = CALENDAR_BEFORE_026D5788.replace("                !inMonth && 'bg-muted',\n", '')

/** @param {(line: string) => void} [log] 預設印到 stdout;meta-test 傳空函式安靜地跑 */
export function selftest(table, log = console.log) {
  const wrap = (body) => `const X = () => (\n${body}\n)\n`
  const cases = [
    // ── 必須紅 ──
    ['026d5788 之前的 Calendar 非當月格(bg-muted + 透明底配對)', wrap(CALENDAR_BEFORE_026D5788), 1, /bg-muted/],
    ['白卡片借透明底的配對(file-upload 檢閱器 pill 的形狀)', `const a = cn('border-border bg-surface text-foreground hover:bg-neutral-hover')`, 1, /--surface/],
    ['已按下切換鈕滑過借透明底配對(2026-09-07 案的 class 形)', `const a = cn('data-[state=on]:bg-neutral-selected data-[state=on]:hover:bg-neutral-hover')`, 1, /--neutral-selected/],
    ['滑過換到 -active(借按壓 token 當 hover)', `const a = cn('bg-transparent hover:bg-neutral-active')`, 1, /不是任何底色的 hover 配對/],
    ['分隔線借 --border 的配對(resize-handle 的形狀)', `const a = x ? 'bg-divider group-hover/resize:bg-[var(--border-hover)]' : 'bg-primary'`, 1, /--divider/],
    // ── 必須綠 ──
    ['026d5788 之後的 Calendar 同一段', wrap(CALENDAR_AT_026D5788), 0],
    ['實心底配自己的 hover', `const a = cn('bg-primary text-on-emphasis', 'hover:bg-primary-hover')`, 0],
    ['選中列滑過釘住', `const a = cn('bg-neutral-selected hover:bg-neutral-selected')`, 0],
    ['已按下切換鈕配自己的 -selected-hover', `const a = cn('data-[state=on]:bg-neutral-selected data-[state=on]:hover:bg-neutral-selected-hover')`, 0],
    ['選中底以 !selected 守衛排除(menu-item 的形狀)', `const a = cn(selected && 'bg-neutral-selected', !disabled && !selected && 'hover:bg-neutral-hover')`, 0],
    ['三元兩個分支互斥', `const a = cn(on ? 'bg-primary hover:bg-primary-hover' : 'hover:bg-neutral-hover')`, 0],
    ['cva 不同 variant 值互斥', `const v = cva('', { variants: { variant: { primary: ['bg-primary', 'hover:bg-primary-hover'], text: ['bg-transparent', 'hover:bg-neutral-hover'] } } })`, 0],
    ['twMerge 後寫者勝(選中時後面的釘住蓋掉前面的透明配對)', `const a = cn('hover:bg-neutral-hover', isSelected && 'bg-neutral-selected hover:bg-neutral-selected')`, 0],
    ['色相 hover 配 step-6 實心底', `const a = 'bg-[var(--color-blue-6)] hover:bg-[var(--blue-hover)]'`, 0],
    ['區域變數不判(Tag dismiss)', `const a = 'bg-transparent group-hover/action:bg-[var(--dismiss-hover)]'`, 0],
    ['帶透明度修飾不判(圖片上的圓點)', `const a = 'bg-on-emphasis/60 hover:bg-on-emphasis/80'`, 0],
    ['--surface-strong 配自己的 -hover(person-display)', `const a = ['bg-surface-strong text-on-emphasis hover:bg-surface-strong-hover'].join(' ')`, 0],
    ['--scrollbar-thumb 配自己的 -hover(scroll-area)', `const a = cn('bg-[var(--scrollbar-thumb)] hover:bg-[var(--scrollbar-thumb-hover)]')`, 0],
    ['巢狀 hover(指到兄弟動作鈕時宿主保留自己的配對,sidebar 的形狀)', `const v = cva(['hover:bg-neutral-hover', '[@media(hover:hover)]:[&:where(:has(~[data-sidebar=menu-action]:hover))]:bg-neutral-hover'])`, 0],
    ['巢狀 hover 借透明底配對(宿主有自己的底色)', `const v = cn('bg-secondary', '[@media(hover:hover)]:[&:where(:has(~[data-x]:hover))]:bg-neutral-hover')`, 1, /--secondary/],
  ]
  let bad = 0
  for (const [name, src, expected, mustName] of cases) {
    const { violations } = scanSource(src, 'selftest.tsx', table)
    const named = !mustName || violations.some((v) => mustName.test(v.why) || mustName.test(v.rest))
    const ok = violations.length === expected && named
    log(`${ok ? '✓' : '✗'} ${name} —— 期望 ${expected} 筆${mustName ? `(須指名 ${mustName})` : ''},實得 ${violations.length} 筆`)
    if (!ok) { bad++; for (const v of violations) log(`    ${v.hover} × ${v.rest}:${v.why}`) }
  }
  // CSS 路徑
  const cssBad = scanCss('.x { background: var(--muted); }\n.x:hover { background: var(--neutral-hover); }', 'selftest.css', table).violations.length
  const cssGood = scanCss('.y:hover { background: var(--neutral-hover); }', 'selftest.css', table).violations.length
  log(`${cssBad === 1 ? '✓' : '✗'} CSS :hover 借透明底配對 —— 期望 1 筆,實得 ${cssBad} 筆`)
  log(`${cssGood === 0 ? '✓' : '✗'} CSS 透明底配 --neutral-hover —— 期望 0 筆,實得 ${cssGood} 筆`)
  if (cssBad !== 1) bad++
  if (cssGood !== 0) bad++
  // 配對表必須真的從 semantic.css 讀到(不是空表 → 全部「不判」而假綠)
  const expectPairs = { '--neutral-hover': 'transparent', '--inverse-neutral-hover': 'transparent', '--primary-hover': '--primary',
    '--border-hover': '--border', '--neutral-selected-hover': '--neutral-selected', '--surface-strong-hover': '--surface-strong',
    '--scrollbar-thumb-hover': '--scrollbar-thumb', '--blue-hover': '--color-blue-6' }
  for (const [h, b] of Object.entries(expectPairs)) {
    const got = table.pairs.get(h)
    log(`${got === b ? '✓' : '✗'} 配對表:${h} → ${b}(實得 ${got})`)
    if (got !== b) bad++
  }
  log(bad ? `\n✗ selftest ${bad} 項不符` : '\n✓ selftest:違規會紅、合法寫法不會紅、配對表確實從 semantic.css 讀到')
  return bad === 0
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * 掃一組檔並套已知清單。全樹掃描(預設)與單檔掃描共用;meta-test 直接呼叫它,不必另起子行程。
 * @param {{ table?: object, files?: Array<[string, string|undefined]>, useBaseline?: boolean }} [options]
 */
export function evaluateTree({ table = loadTable(), files = walk(SRC).map((p) => [p, undefined]), useBaseline = true } = {}) {
  const all = { violations: [], unresolved: [], skipped: [], evaluated: [] }
  for (const [abs, content] of files) {
    const r = scanFile(abs, table, content)
    for (const k of Object.keys(all)) all[k].push(...r[k])
  }
  const baseline = useBaseline && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).entries || [] : []
  // 已知清單只收兩種、每筆都要寫理由 —— 否則它就變成「把紅燈塞進去」的後門
  const malformed = baseline.filter((e) => !['pending', 'unreachable'].includes(e.kind) || !e.reason || e.reason.length < 12 || !e.file || !e.hover || !e.rest)
  const known = new Map(baseline.map((e) => [`${e.file}|${e.hover}|${e.rest}`, e]))
  const fresh = all.violations.filter((v) => !known.has(baselineKey(v)))
  const pending = all.violations.filter((v) => known.has(baselineKey(v)))
  const stale = [...known.keys()].filter((k) => !all.violations.some((v) => baselineKey(v) === k))
  return { table, fileCount: files.length, ...all, malformed, known, fresh, pending, stale }
}

function main() {
  const table = loadTable()
  if (process.argv.includes('--selftest')) { process.exit(selftest(table) ? 0 : 1) }
  const verbose = process.argv.includes('--verbose')
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.slice(7)
  const files = fileArg
    ? [[resolve(REPO, fileArg), process.argv.includes('--stdin') ? readFileSync(0, 'utf8') : undefined]]
    : undefined
  const { fileCount, malformed, known, fresh, pending, stale, ...all } = evaluateTree({ table, files, useBaseline: !process.argv.includes('--no-baseline') })
  // 沒量到 ≠ 沒有違規(M37):全樹掃描卻一組 (滑過值, 靜止值) 都沒判到 = 儀器壞了(解析器 / 路徑 / 配對表),不是「全部合規」
  if (!fileArg && (all.evaluated.length === 0 || table.pairs.size === 0)) {
    console.error(`INSTRUMENT-FAIL:掃了 ${fileCount} 個檔、判了 ${all.evaluated.length} 組、配對表 ${table.pairs.size} 組 —— 量具沒拿到資料,不能讀成通過`)
    process.exit(1)
  }
  if (process.argv.includes('--list')) {
    for (const e of all.evaluated) console.log(`${e.verdict} ${e.path}:${e.line}  ${e.hover}  ×  ${e.rest}`)
  }
  if (malformed.length) {
    console.error(`✗ hover-own-pair-baseline.json 有 ${malformed.length} 筆格式不合(kind 只准 pending / unreachable,reason 必須寫清楚):`)
    for (const e of malformed) console.error(`  ${JSON.stringify(e)}`)
    process.exit(1)
  }

  console.log(`掃了 ${fileCount} 個檔;配對表 ${table.pairs.size} 組(從 semantic.css 現讀);判了 ${all.evaluated.length} 組 (滑過值, 靜止值)`)
  if (pending.length) {
    const label = { pending: '待 user 拍板', unreachable: '執行期不會發生' }
    console.log(`\n· 已知命中(${pending.length} 筆,登記於 scripts/hover-own-pair-baseline.json,不擋):`)
    for (const v of pending) {
      const e = known.get(baselineKey(v))
      console.log(`  [${label[e.kind] ?? e.kind}] ${v.path}:${v.line}  ${v.hover} × ${v.rest} —— ${e.reason}`)
    }
  }
  if (stale.length) {
    console.log(`\n· 已知清單裡有 ${stale.length} 筆這次沒出現(已修好或寫法變了)—— 請把它們從 hover-own-pair-baseline.json 移除,收緊清單:`)
    for (const k of stale) console.log(`  ${k}`)
  }
  console.log(`\n· 不判:${all.skipped.length} 筆(區域變數 / 帶透明度修飾 / 任意色值);看不到靜止底:${all.unresolved.length} 筆${verbose ? '' : '(--verbose 列出)'}`)
  if (verbose) {
    for (const u of all.unresolved) console.log(`  看不到靜止底 ${u.path}:${u.line}  ${u.hover}`)
    for (const s of all.skipped) console.log(`  不判 ${s.path}:${s.line}  ${s.hover}`)
  }
  if (fresh.length) {
    console.error(`\n✗ ${fresh.length} 處滑過底色不是「元素自己靜止底色」的配對(SSOT:tokens/color/color.spec.md「Hover 換色配對總則」):`)
    for (const v of fresh) console.error(`  ${v.path}:${v.line}  ${v.hover}  ×  靜止 ${v.rest}${v.restLine ? `(:${v.restLine})` : ''}\n      ${v.why}`)
    console.error('\n  修法:靜止底是 token → 滑過換成那個底自己的 -hover(同一條色階的下一階);靜止底透明 → --neutral-hover;')
    console.error('  需要的配對 token 不存在 → 依 color.spec.md 新增(不得借別的底的配對,也不得借 -active);')
    console.error('  可點的東西不該站在 --muted(靜態非互動)上。')
    process.exit(1)
  }
  console.log('\n✓ 滑過底色全部是元素自己靜止底色的配對(或釘住)')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
