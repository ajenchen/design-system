#!/usr/bin/env node
/**
 * DataTable 列 / 表頭元素快取的依賴完整性閘(2026-09-08;Codex R7 校正後 v2)。
 *
 * 列元素快取(`data-table.tsx` 的 `rowElCacheRef` + `rowRenderEpoch`)與表頭快取(`headerElCacheRef` + `headerRenderEpoch`)
 * 靠手列的 `epochDeps` / `headerEpochDeps` 判斷「舊元素可以直接重用」。手列會漏:I2 抓到 `resolvedWidths`(自動分配欄寬)
 * 沒列 → 欄寬變了舊列不重算,顯示↔編輯寬差 0.59px。本閘用 TypeScript 語法樹把 `renderRowFresh` / `renderHeaderRowFresh`
 * (含它們呼叫的、宣告在祖先作用域裡的 helper)讀到的每一個外層變數列出來,每一個都必須 (a) 在 deps 裡,或 (b) 在白名單
 * (附「為何不需要」的理由)。多出任何一個未分類的變數就紅。
 *
 * 本閘能證明什麼、不能證明什麼(Codex R7 Q4 verdict,逐字採納):
 * - 能:直接讀取的外層變數有沒有進 deps(lexical free variables)。
 * - 不能:透過 `ref.current`、`table.getState()` / `table.options` 等 getter 讀到的**可變值**——那些要靠 deps 明列對應的
 *   state / props(`tableStateForEpoch.*`、`tableOptions`),本閘只確認 `table` / ref 本身有被分類;也不能檢查 useCallback
 *   本體的 stale capture(那是 exhaustive-deps lint 的職責,本 repo 目前沒開)。
 *
 * 對照組(M32「儀器要先有對照組」):`--selftest` (1) 把 `resolvedWidths` 從 deps 拿掉必須紅;(2) 四個合成 fixture 覆蓋
 * Codex R7 抓到的假陰性:巢狀作用域同名遮蔽、`function` 宣告的 helper、同名 helper 覆蓋、型別位置的識別字不算讀取。
 */
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(REPO, 'packages/design-system/src/components/DataTable/data-table.tsx')
const SELFTEST = process.argv.includes('--selftest')

/** 不需要進 epochDeps 的外層變數 + 理由(每一條都是可驗證的事實) */
const ALLOW_ROW = {
  cellEl: 'render-time helper,本閘已展開其自由變數',
  colsToIds: 'render-time helper,本閘已展開其自由變數',
  getRegionCells: 'render-time helper,本閘已展開其自由變數',
  hoverProps: 'render-time helper(回傳空物件),本閘已展開其自由變數',
  isLastInRegion: 'render-time helper,本閘已展開其自由變數',
  renderCellContent: 'render-time helper,本閘已展開其自由變數',
  isCenter: 'renderBodyRows 的 per-region 常數;快取 key 含 regionKey,不同 region 不共用快取(primary 分配改成動態時本條失效)',
  isRight: 'renderBodyRows 的 per-region 常數;快取 key 含 regionKey',
  isPrimaryRegion: 'renderBodyRows 的 per-region 常數;快取 key 含 regionKey',
  regionRole: 'renderBodyRows 的 per-region 常數;快取 key 含 regionKey',
  setEditingCellId: 'useState setter,身分恆定',
  setRangeAnchor: 'useState setter,身分恆定',
  setRangeFocus: 'useState setter,身分恆定',
  setSelectedCellId: 'useState setter,身分恆定',
  sharedRowHeights: '每列只讀 `.get(idx)` / `.has(idx)`;Map<number, number> 下 get 為 undefined ⇔ !has,已在 rowEl 的 per-row deps(`sharedRowHeights.get(idx)`)',
  table: 'useReactTable 實例身分恆定,但它的 state / options 會變:state 經 tableStateForEpoch.* 個別列入、options 經 tableOptions 與各 enable* prop 列入;自訂 header / cell renderer 若讀 table 其他狀態不在本閘保證內',
  cols: 'renderBodyRows 的 per-region 參數,已在 rowEl 的 per-row deps',
}
/** 表頭快取(headerEpochDeps 含 rowRenderEpoch,所以 epochDeps 裡的名字也算已涵蓋) */
const ALLOW_HEADER = {
  colsToIds: 'render-time helper,本閘已展開其自由變數',
  getRegionHeaders: 'render-time helper,本閘已展開其自由變數',
  headerCellEl: 'render-time helper,本閘已展開其自由變數',
  isLastInRegion: 'render-time helper,本閘已展開其自由變數',
  centerBodyRef: 'useRef;只在事件當下讀 .current(auto-fit),不是 render 輸入',
  liveColumnResizeRef: 'useRef;只在事件當下讀寫',
  prevColumnSizingRef: 'useRef;只在事件當下讀寫',
  tableRef: 'useRef;只在事件當下讀 .current',
  table: ALLOW_ROW.table,
}
const TARGETS = [
  { name: 'renderRowFresh', depsVar: 'epochDeps', allow: ALLOW_ROW, inherit: null },
  // 列殼(2026-09-09)也走同一份快取,依賴同樣要列全(Codex R9);白名單與真列共用,「沒人用的白名單項」只在真列那一筆檢查
  { name: 'renderShellRow', depsVar: 'epochDeps', allow: ALLOW_ROW, inherit: null, sharedAllow: true },
  { name: 'renderHeaderRowFresh', depsVar: 'headerEpochDeps', allow: ALLOW_HEADER, inherit: 'epochDeps' },
]

const isFnLike = (n) => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)
const isScope = (n) => isFnLike(n) || ts.isBlock(n) || ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isCaseBlock(n)
const bind = (b, set) => { if (!b) return; if (ts.isIdentifier(b)) set.add(b.text); else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) b.elements.forEach((e) => e.name && bind(e.name, set)) }
/** 識別字是不是「讀取一個變數」(排除 property 名、JSX attribute 名、型別位置) */
const isValueRead = (n) => {
  const par = n.parent
  if ((ts.isPropertyAccessExpression(par) && par.name === n) || (ts.isPropertyAssignment(par) && par.name === n) || (ts.isBindingElement(par) && par.propertyName === n) || ts.isJsxAttribute(par) || ts.isPropertySignature(par) || ts.isMethodSignature(par) || ts.isTypeParameterDeclaration(par)) return false
  if (ts.isPropertyAssignment(par) && par.name === n) return false
  for (let q = par; q && !ts.isStatement(q) && !isFnLike(q); q = q.parent) {
    if (ts.isTypeNode(q) || ts.isTypeAliasDeclaration(q) || ts.isInterfaceDeclaration(q)) return false
  }
  return true
}
/** 該節點直接宣告的名字(不進入巢狀 scope) */
const declaredIn = (scope) => {
  const set = new Set()
  if (isFnLike(scope)) for (const p of scope.parameters) bind(p.name, set)
  const root = isFnLike(scope) ? scope.body : scope   // 函式本體的 Block 屬於函式自己的 scope,不是巢狀 scope
  const v = (n) => {
    if (n !== root && isScope(n)) { if (ts.isFunctionDeclaration(n) && n.name) set.add(n.name.text); return }
    if (ts.isVariableDeclaration(n)) bind(n.name, set)
    if (ts.isFunctionDeclaration(n) && n.name) set.add(n.name.text)
    ts.forEachChild(n, v)
  }
  if (root) v(root)
  return set
}

/** 分析:回傳 target 讀到的、宣告在其祖先函式鏈上的名字 */
export function analyze(src, targetName, fileName = 'x.tsx') {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  // 所有具名函式(可能重名):以宣告節點為準,解析時取「包住使用點的最近祖先 scope 裡」的那一個
  const fnDecls = []
  const idx = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isFnLike(n.initializer)) fnDecls.push({ name: n.name.text, fn: n.initializer, scopeNode: n })
    if (ts.isFunctionDeclaration(n) && n.name) fnDecls.push({ name: n.name.text, fn: n, scopeNode: n })
    ts.forEachChild(n, idx)
  }
  idx(sf)
  const target = fnDecls.find((d) => d.name === targetName)
  if (!target) return null
  const ancestors = []; for (let p = target.fn.parent; p; p = p.parent) if (isFnLike(p)) ancestors.push(p)
  const outermost = ancestors[ancestors.length - 1]
  const inAncestorChain = (node) => outermost && outermost.pos <= node.pos && node.end <= outermost.end
  // 祖先鏈宣告的名字(以最近的祖先 scope 為準;巢狀函式內的宣告不算)
  const ancestorDeclared = new Map()
  for (const a of ancestors) { const set = declaredIn(a); for (const n of set) if (!ancestorDeclared.has(n)) ancestorDeclared.set(n, a) }
  const resolveFn = (name, useSite) => {
    const cands = fnDecls.filter((d) => d.name === name && inAncestorChain(d.fn) && !(d.fn.pos <= useSite.pos && useSite.end <= d.fn.end))
    // 取宣告在「包住 useSite 的最小 scope」裡的那個(最近的可見宣告)
    let best = null
    for (const c of cands) { let sc = c.scopeNode.parent; while (sc && !isScope(sc)) sc = sc.parent; if (sc && sc.pos <= useSite.pos && useSite.end <= sc.end) { if (!best || (sc.end - sc.pos) < (best.span)) best = { fn: c.fn, span: sc.end - sc.pos } } }
    return best ? best.fn : null
  }
  const used = new Set(); const seen = new Set()
  const walkFn = (fn) => {
    if (seen.has(fn)) return; seen.add(fn)
    // scope 堆疊:每個 function / block 一層,宣告只遮蔽自己與內層
    const scopes = []
    const visible = (name) => scopes.some((s) => s.has(name))
    const visit = (n) => {
      const opens = n === fn || isScope(n)
      if (opens) scopes.push(declaredIn(n))
      if (ts.isIdentifier(n) && isValueRead(n)) {
        const t = n.text
        if (!visible(t) && ancestorDeclared.has(t)) {
          used.add(t)
          const f = resolveFn(t, n)
          if (f) walkFn(f)
        }
      }
      ts.forEachChild(n, visit)
      if (opens) scopes.pop()
    }
    visit(fn)
  }
  walkFn(target.fn)
  return { used, ancestors: ancestors.length }
}

const readDeps = (src, varName) => { const m = src.match(new RegExp(`const ${varName}: unknown\\[\\] = \\[([\\s\\S]*?)\\]\\n`)); if (!m) return null; return new Set(m[1].split('\n').filter((l) => !l.trim().startsWith('//')).join(',').split(',').map((s) => s.trim()).filter(Boolean)) }

function run(src) {
  let failed = 0; const missingAll = []
  for (const T of TARGETS) {
    const r = analyze(src, T.name, FILE)
    if (!r) { console.log(`✗ 找不到 ${T.name}`); return { failed: 1, missing: [] } }
    const deps = readDeps(src, T.depsVar); if (!deps) { console.log(`✗ 找不到 ${T.depsVar}`); return { failed: 1, missing: [] } }
    const inherited = T.inherit && deps.has('rowRenderEpoch') ? readDeps(src, T.inherit) : null
    const inDeps = (k) => deps.has(k) || deps.has('tableStateForEpoch.' + k) || (inherited ? inherited.has(k) || inherited.has('tableStateForEpoch.' + k) : false)
    const ALLOW = T.allow; const used = r.used
    const missing = [...used].filter((k) => !inDeps(k) && !(k in ALLOW)).sort()
    const staleAllow = T.sharedAllow ? [] : Object.keys(ALLOW).filter((k) => !used.has(k))
    const both = Object.keys(ALLOW).filter((k) => deps.has(k))
    console.log(`${T.name} 外層變數 ${used.size} 個:${T.depsVar} 命中 ${[...used].filter(inDeps).length},白名單 ${[...used].filter((k) => k in ALLOW && !inDeps(k)).length}`)
    if (missing.length) { failed++; missingAll.push(...missing); console.log(`✗ ${T.name}:未分類的外層變數(要進 ${T.depsVar} 或白名單附理由):${missing.join(', ')}`) }
    if (staleAllow.length) { failed++; console.log(`✗ ${T.name}:白名單裡已沒人用的名字(清掉):${staleAllow.join(', ')}`) }
    if (both.length) { failed++; console.log(`✗ ${T.name}:同時在 deps 與白名單(擇一):${both.join(', ')}`) }
  }
  return { failed, missing: missingAll }
}

if (SELFTEST) {
  let bad = 0
  // (1) 拿掉 resolvedWidths 必紅
  const src = readFileSync(FILE, 'utf8')
  const stripped = src.replace(/(const epochDeps: unknown\[\] = \[[\s\S]*?)\bresolvedWidths, /, '$1')
  if (stripped === src) { console.log('✗ selftest:找不到 resolvedWidths 可拿掉'); bad++ }
  else { const r = run(stripped); if (r.failed && r.missing.includes('resolvedWidths')) console.log('✓ selftest 1:拿掉 resolvedWidths 後閘會紅'); else { console.log('✗ selftest 1:拿掉 resolvedWidths 後閘沒紅'); bad++ } }
  // (2) 合成 fixture:Codex R7 抓到的四種假陰性
  const fixtures = [
    ['巢狀作用域同名遮蔽不得蓋掉外層讀取', `function Outer(){ const x = 1; const y = 2; const target = () => { const inner = () => { const x = 9; return x }; inner(); return x + y } ; return target }`, ['x', 'y']],
    ['function 宣告的 helper 要被登記並展開', `function Outer(){ const z = 1; function helper(){ return z } const target = () => helper(); return target }`, ['helper', 'z']],
    ['同名 helper:取包住使用點的最近宣告', `function Outer(){ const a = 1; const b = 2; const helper = () => a; const target = () => { const helper = () => b; return helper() }; return [target, helper] }`, ['b']],
    ['型別位置的識別字不算讀取', `function Outer(){ const ref = 1; const w = 2; const target = () => { const p: { ref?: number } = {}; return p.ref ?? w } ; return target }`, ['w']],
  ]
  for (const [label, code, expected] of fixtures) {
    const r = analyze(code, 'target')
    const got = [...r.used].sort().join(','); const want = [...expected].sort().join(',')
    if (got === want) console.log(`✓ selftest fixture:${label}`); else { console.log(`✗ selftest fixture:${label} —— 期望 [${want}] 得到 [${got}]`); bad++ }
  }
  process.exit(bad ? 1 : 0)
}

const { failed } = run(readFileSync(FILE, 'utf8'))
if (failed) process.exit(1)
console.log('✓ 列 / 表頭快取依賴完整(lexical free variables;ref.current / table getter 的可變值另靠 deps 明列 state 與 props)')
