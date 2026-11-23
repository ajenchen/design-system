// 公開介面量具(2026-11-16):一棵「含 packages/design-system 的樹」→ 消費端看得到的公開介面快照。
//
// 唯一呼叫端:scripts/public-surface-invariant.mjs(上一個發布 tag 的 git archive vs 工作樹,或兩個 tag 之間)。
// 量的五類(與 packages/design-system/ds-changes.json 的 surface / target 同一套鍵):
//   (a) subpath:package.json exports 的每個子路徑(含 ./components/*、./tokens/*、./hooks/*、./styles/*)與每個子路徑的出口
//       → subpaths Map<'./components/Button', {file}>、exports Map<名字, Map<子路徑, 'value'|'type'>>
//   (b) 型別成員:每個出口(值與型別)能走到、而且宣告在 DS 原始碼裡的成員(不限 *Props / *Labels;
//       含 `declare module` 擴充,如 DataTable 的 ColumnMeta)→ members Map<'宣告處.成員', {optional, shape}>
//   (c) 出貨 CSS 宣告的自訂屬性 → cssVars Map<'--x', 位置>
//   (d) DS 自訂的 @utility → utilities Map<'text-h1', 位置>
//   (e) 預設值:cva defaultVariants、出口元件參數解構的預設、components / patterns 裡的具名常數 → defaults Map<鍵, {value}>
//
// 量法:TypeScript checker(版本鎖在 package.json 的 typescript 5.9.3)。git archive 出來的舊樹沒有 node_modules,
// 裸模組名(react / @radix-ui / @tanstack …)一律改從 repo 的 node_modules 解析(同一份依賴),路徑別名照 DS tsconfig。
// 本檔不判對錯、不讀帳本;比對與帳本對照在 public-surface-invariant.mjs。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import ts from 'typescript'

export class SurfaceInstrumentError extends Error {}

const PKG_REL = 'packages/design-system'
const MODULE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js'])
const NOT_SHIPPED_SOURCE = /\.(stories|test|spec)\.tsx?$|\.d\.ts$|\/stories-helpers\//

const toPosix = (p) => p.split(sep).join('/')

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) walkFiles(abs, out)
    else out.push(abs)
  }
  return out
}

// ── (a) 子路徑 ───────────────────────────────────────────────────────────────────
/** exports 的目標(`./dist/x.js` 或 `./src/x.css`)→ 原始碼路徑樣式(dist 由 src 建置,rootDir = src) */
function sourcePatternOf(target) {
  if (!target.startsWith('./dist/')) return target.replace(/^\.\//, '')
  return target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')
}

/** 一棵樹的 exports 子路徑:Map<子路徑, { file: 絕對路徑 | null, module: boolean }> */
export function enumerateSubpaths(pkgDir) {
  const pkgPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgPath)) throw new SurfaceInstrumentError(`讀不到 ${pkgPath}`)
  let pkg
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch (e) { throw new SurfaceInstrumentError(`${pkgPath} 不是合法 JSON:${e.message}`) }
  const map = pkg.exports
  if (!map || typeof map !== 'object') throw new SurfaceInstrumentError(`${pkgPath} 沒有 exports`)
  const out = new Map()
  const allFiles = walkFiles(join(pkgDir, 'src')).map((abs) => toPosix(relative(pkgDir, abs)))
  for (const [key, raw] of Object.entries(map)) {
    const target = typeof raw === 'string' ? raw : raw?.import ?? raw?.default ?? raw?.types
    if (typeof target !== 'string') throw new SurfaceInstrumentError(`exports["${key}"] 讀不出目標`)
    const pattern = sourcePatternOf(target)
    if (!key.includes('*')) {
      const abs = join(pkgDir, pattern)
      const ext = extname(pattern)
      const tsAbs = ext === '.ts' && !existsSync(abs) && existsSync(`${abs}x`) ? `${abs}x` : abs
      out.set(key, { file: existsSync(tsAbs) ? tsAbs : null, module: MODULE_EXT.has(ext) })
      continue
    }
    const [head, tail] = pattern.split('*')
    const tails = tail.endsWith('.ts') ? [tail, `${tail}x`] : [tail]
    for (const rel of allFiles) {
      if (!rel.startsWith(head) || NOT_SHIPPED_SOURCE.test(rel)) continue
      const t = tails.find((x) => rel.endsWith(x) && rel.length > head.length + x.length)
      if (!t) continue
      const star = rel.slice(head.length, rel.length - t.length)
      out.set(key.replace('*', star), { file: join(pkgDir, rel), module: true })
    }
  }
  return out
}

// ── TypeScript program(舊樹的裸模組名從 repo 的 node_modules 解析)──────────────────────
function createProgram(pkgDir, roots, repoRoot) {
  const options = {
    allowJs: true, checkJs: false, noEmit: true, strict: true, skipLibCheck: true, types: [],
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, resolveJsonModule: true, allowImportingTsExtensions: true,
    baseUrl: pkgDir, paths: { '@/design-system/*': ['./src/*'], '@/lib/*': ['./src/lib/*'] },
  }
  const host = ts.createCompilerHost(options, true)
  const anchor = join(repoRoot, PKG_REL, 'src', 'index.ts')
  host.resolveModuleNameLiterals = (literals, containingFile) => literals.map((lit) => {
    const name = lit.text
    let r = ts.resolveModuleName(name, containingFile, options, host)
    if (!r.resolvedModule && !name.startsWith('.') && !name.startsWith('@/')) r = ts.resolveModuleName(name, anchor, options, host)
    return r
  })
  return ts.createProgram({ rootNames: roots, options, host })
}

/** 正規化型別文字的頂層聯集拆開(括號 / 角括號 / 方括號 / 大括號裡的 ` | ` 不拆) */
export function splitUnion(text) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if ('([<{'.includes(c)) depth += 1
    else if (')]>}'.includes(c) && !(c === '>' && text[i - 1] === '=')) depth -= 1
    else if (depth === 0 && text.startsWith(' | ', i)) { out.push(text.slice(start, i)); start = i + 3; i += 2 }
  }
  out.push(text.slice(start))
  return out
}

// ── (b) 型別成員:解析後的介面全文 ────────────────────────────────────────────────────
// 每個出口用 TS checker 展開:props / 型別攤平到含繼承來的成員(extends、Omit、Pick 都算),每個成員印出「正規化型別文字」;
// 函式印出參數列與回傳。正規化(normalizeType)的規則 —— 雜訊從量法本身消掉,不靠放寬判定:
//   · 聯集 / 交集的成員各自正規化後排序去重(TS 印的順序會變);選填成員的 `undefined` 拿掉(選填另記一欄)
//   · 型別別名一律展開(DS 的 `type Size = 'sm' | 'md'` 改名叫 FieldSize 不算改變)
//   · DS 自己宣告的物件型別印成 `{DS}`,它的成員以它自己的住處另外量(一處改動只在它自己那個鍵報一次,不在每個引用它的成員重複報)
//   · DS 以外(React / TanStack / lib)的具名型別印名字加型別引數(兩邊共用同一份 node_modules,見閘頭「已知限制」)
//   · 函式型別印 `(參數: 型別, 選填?: 型別) => 回傳`;型別參數印名字
function createTypeNormalizer(checker, isDsDecl, enqueue, options = {}) {
  const isDsSymbol = (s) => Boolean(s?.declarations?.length && s.declarations.some((d) => isDsDecl(d)))
  const PRIMITIVE = [
    [ts.TypeFlags.Any, 'any'], [ts.TypeFlags.Unknown, 'unknown'], [ts.TypeFlags.String, 'string'], [ts.TypeFlags.Number, 'number'],
    [ts.TypeFlags.BigInt, 'bigint'], [ts.TypeFlags.ESSymbol, 'symbol'], [ts.TypeFlags.Void, 'void'], [ts.TypeFlags.Undefined, 'undefined'],
    [ts.TypeFlags.Null, 'null'], [ts.TypeFlags.Never, 'never'], [ts.TypeFlags.NonPrimitive, 'object'],
  ]
  const sigText = (sig, depth, { propsParam = false } = {}) => {
    const params = sig.getParameters().map((p, index) => {
      if (propsParam && index === 0) return 'props'
      const d = p.valueDeclaration ?? p.declarations?.[0]
      const optional = Boolean(d && ts.isParameter(d) && (d.questionToken || d.initializer)) || Boolean(p.flags & ts.SymbolFlags.Optional)
      const rest = Boolean(d && ts.isParameter(d) && d.dotDotDotToken)
      return `${rest ? '...' : ''}${optional ? '?' : ''}: ${norm(checker.getTypeOfSymbol(p), depth + 1, optional)}`
    })
    const tps = sig.getTypeParameters()?.length ? `<${sig.getTypeParameters().length}>` : ''
    return `${tps}(${params.join(', ')}) => ${norm(sig.getReturnType(), depth + 1)}`
  }
  /** 函式型別放進聯集 / 陣列時加括號;聯集放進陣列時也加(否則 `a | b[]` 有兩種讀法) */
  const wrap = (text, inArray = false) => (/=>/.test(text) || (inArray && / [|&] /.test(text)) ? `(${text})` : text)
  const named = (sym, args, depth) => `${sym.name}${args?.length ? `<${args.map((a) => norm(a, depth + 1)).join(', ')}>` : ''}`
  const norm = (type, depth = 0, dropUndefined = false) => {
    if (!type) return '?'
    if (depth > 6) return '…'
    const f = type.flags
    // DS 以外的具名別名(React.ReactNode 是個大聯集):印名字,不展開
    if (type.aliasSymbol && !isDsSymbol(type.aliasSymbol)) return named(type.aliasSymbol, type.aliasTypeArguments, depth)
    if (type.isUnion()) {
      const parts = [...new Set(type.types.filter((t) => !(dropUndefined && t.flags & ts.TypeFlags.Undefined)).map((t) => wrap(norm(t, depth))))].sort()
      return parts.join(' | ')
    }
    if (type.isIntersection()) return [...new Set(type.types.map((t) => wrap(norm(t, depth))))].sort().join(' & ')
    // 出口常數(沒有型別註記、由字面值推出的資料):只比形狀,字面值放寬成它的基本型別(內容是資料,不是介面)
    if (options.widen?.()) {
      if (f & ts.TypeFlags.StringLiteral || f & ts.TypeFlags.TemplateLiteral) return 'string'
      if (f & ts.TypeFlags.NumberLiteral) return 'number'
      if (f & ts.TypeFlags.BooleanLiteral) return 'boolean'
      if ((f & ts.TypeFlags.Object) && (checker.isArrayType(type) || checker.isTupleType(type))) return 'array'
    }
    if (f & ts.TypeFlags.StringLiteral) return JSON.stringify(type.value)
    if (f & ts.TypeFlags.NumberLiteral) return String(type.value)
    if (f & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.BigIntLiteral | ts.TypeFlags.EnumLiteral | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.UniqueESSymbol)) return checker.typeToString(type)
    for (const [flag, text] of PRIMITIVE) if (f & flag) return text
    if (f & ts.TypeFlags.TypeParameter) return type.symbol?.name ?? 'T'
    if (!(f & ts.TypeFlags.Object)) return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
    if (checker.isArrayType(type)) return `${wrap(norm(checker.getTypeArguments(type)[0], depth + 1), true)}[]`
    if (checker.isTupleType(type)) return `[${checker.getTypeArguments(type).map((t) => norm(t, depth + 1)).join(', ')}]`
    const calls = type.getCallSignatures()
    const props = checker.getPropertiesOfType(type)
    // DS 以外的具名型別(HTMLElement、MouseEvent、ColumnDef<…>):名字 + 型別引數
    const sym = type.symbol
    const anonymous = !sym || sym.name.startsWith('__')
    if (sym && !anonymous && !isDsSymbol(sym)) return named(sym, type.target ? checker.getTypeArguments(type) : undefined, depth)
    // 只有呼叫簽名的(函式型別,不論誰宣告):印簽名
    if (calls.length && !props.length) return calls.map((s) => sigText(s, depth)).sort().join(' & ')
    if (anonymous && !(sym?.declarations ?? []).some((d) => isDsDecl(d))) return props.length ? `{${props.map((p) => p.name).sort().join(',')}}` : '{}'
    // DS 宣告的物件型別:成員另外量
    enqueue(type)
    return '{DS}'
  }
  return { norm, sigText, isDsSymbol }
}

/** 宣告的「住處」名字:interface / type / class / 函式 / 變數名,中間經過的具名成員接成路徑 */
function containerOf(decl) {
  const parts = []
  let n = decl.parent
  while (n) {
    if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isEnumDeclaration(n)) && n.name) { parts.unshift(n.name.text); break }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) { parts.unshift(n.name.text); break }
    if ((ts.isPropertySignature(n) || ts.isPropertyDeclaration(n) || ts.isPropertyAssignment(n)) && n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) parts.unshift(n.name.text)
    if (ts.isSourceFile(n)) { parts.unshift(n.fileName.split('/').pop().replace(/\.[^.]+$/, '')); break }
    n = n.parent
  }
  return parts.join('.')
}

function collectMembers(checker, program, srcDir, entries) {
  const isDsDecl = (d) => {
    const f = d.getSourceFile().fileName
    return toPosix(f).startsWith(`${toPosix(srcDir)}/`) && !NOT_SHIPPED_SOURCE.test(toPosix(f))
  }
  /** key(住處.成員)→ { optional, texts: Set, at, anchors: Set } */
  const members = new Map()
  /** 錨點(出口 / 擴充介面)→ Map<成員名, { key, optional, text }>:攤平後的頂層成員(搬到 base interface 時用來比) */
  const anchorMembers = new Map()
  /** 出口的簽名 / 非物件型別的展開文字:Map<出口名, text> */
  const signatures = new Map()
  const queue = []
  const queued = new Set()
  let currentAnchor = null
  let currentWiden = false
  const { norm, sigText, isDsSymbol } = createTypeNormalizer(checker, isDsDecl, (type) => {
    const id = `${type.id}:${currentWiden}`
    if (queued.has(id)) return
    queued.add(id)
    queue.push({ type, anchor: currentAnchor, fallback: dsNameOf(type) ?? null, widen: currentWiden })
  }, { widen: () => currentWiden })
  function dsNameOf(t) {
    if (!t) return null
    if (t.aliasSymbol && isDsSymbol(t.aliasSymbol)) return t.aliasSymbol.name
    if (t.symbol && !t.symbol.name.startsWith('__') && isDsSymbol(t.symbol)) return t.symbol.name
    for (const x of [...(t.isUnion() || t.isIntersection() ? t.types : []), ...(t.aliasTypeArguments ?? [])]) {
      const n = dsNameOf(x)
      if (n) return n
    }
    return null
  }
  /** 可以攤平成成員的物件(介面 / 型別字面值 / 交集),不含陣列、tuple、純函式型別 */
  const isPropsLike = (t) => (t.isUnion()
    ? t.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))).every((x) => isPropsLike(x))
    : (t.isIntersection() || (t.flags & ts.TypeFlags.Object))
      && !checker.isArrayType(t) && !checker.isTupleType(t) && !(t.getCallSignatures().length && !checker.getPropertiesOfType(t).length))
  const at = (decl) => {
    const sf = decl.getSourceFile()
    return `${toPosix(relative(srcDir, sf.fileName))}:${sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1}`
  }
  /** 一個物件型別的全部成員(含繼承 / 對映來的);DS 宣告的成員以它的住處為鍵,繼承自外部型別的以 fallback 為住處 */
  const collectObject = (type, anchor, fallback, top) => {
    // 二擇一的 props(聯集):每一支的成員都算;某一支沒有或選填 = 消費端可以不寫 = 選填
    const branches = type.isUnion() ? type.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) : [type]
    const required = new Map()
    for (const b of branches) for (const prop of checker.getPropertiesOfType(b)) required.set(prop.name, (required.get(prop.name) ?? 0) + (prop.flags & ts.SymbolFlags.Optional ? 0 : 1))
    // 同名成員在每一支的型別合成一個聯集(二擇一的 props:collapsible 一支 false、一支 true = false | true)
    const branchTexts = new Map()
    const seenNames = new Set()
    for (const prop of branches.flatMap((b) => checker.getPropertiesOfType(b))) {
      if (prop.name.startsWith('__@')) continue
      currentAnchor = anchor
      const optionalHere = (required.get(prop.name) ?? 0) < branches.length
      if (!branchTexts.has(prop.name)) branchTexts.set(prop.name, new Set())
      // DS 宣告、有型別註記的成員用宣告處的型別(未代入型別參數),同一個鍵只有一種寫法
      const d = prop.valueDeclaration ?? prop.declarations?.[0]
      const declared = d && isDsDecl(d) && (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && d.type ? checker.getTypeFromTypeNode(d.type) : checker.getTypeOfSymbol(prop)
      for (const part of splitUnion(norm(declared, 0, optionalHere))) branchTexts.get(prop.name).add(part)
    }
    for (const prop of branches.flatMap((b) => checker.getPropertiesOfType(b))) {
      if (seenNames.has(prop.name)) continue
      seenNames.add(prop.name)
      // 內建 symbol 成員(__@iterator@1132)名字帶內部編號、不是消費端寫得出的名字
      if (prop.name.startsWith('__@')) continue
      const decl = prop.valueDeclaration ?? prop.declarations?.[0]
      const ds = Boolean(decl && isDsDecl(decl))
      const container = ds ? containerOf(decl) : fallback
      if (!container) continue
      const key = `${container}.${prop.name}`
      const optional = (required.get(prop.name) ?? 0) < branches.length
      // `never`(這一支不准寫)併進別支時就是空集合;選填的 undefined 另記一欄
      const all = [...branchTexts.get(prop.name)].filter((x) => !(optional && x === 'undefined'))
      const parts = all.length > 1 ? all.filter((x) => x !== 'never') : all
      const text = parts.length > 1 ? [...new Set(parts)].sort().join(' | ') : parts[0] ?? 'never'
      if (!members.has(key)) members.set(key, { optional, texts: new Set(), at: decl && ds ? at(decl) : `${fallback}(繼承)`, anchors: new Set() })
      const m = members.get(key)
      m.texts.add(text)
      m.optional = m.optional && optional
      m.anchors.add(anchor)
      if (top) {
        if (!anchorMembers.has(anchor)) anchorMembers.set(anchor, new Map())
        anchorMembers.get(anchor).set(prop.name, { key, optional, text, input: top !== 'output' })
      }
    }
  }
  const drain = () => {
    while (queue.length) {
      const { type, anchor, fallback, widen } = queue.shift()
      currentWiden = widen
      collectObject(type, anchor, fallback, false)
    }
  }
  for (const { name, symbol } of entries) {
    let target = symbol
    if (symbol.flags & ts.SymbolFlags.Alias) { try { target = checker.getAliasedSymbol(symbol) } catch { target = symbol } }
    const decl = target.valueDeclaration ?? target.declarations?.[0]
    if (!decl) continue
    currentAnchor = name
    currentWiden = false
    if (target.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class | ts.SymbolFlags.Enum)) {
      const t = checker.getDeclaredTypeOfSymbol(target)
      if (isPropsLike(t)) collectObject(t, name, name, true)
      // 非物件(聯集、字面值、函式型別):別名展開後的全文
      else signatures.set(name, `type ${(t.isUnion() ? t.types.map((x) => norm(x)).sort() : [norm(t)]).join(' | ')}`)
    }
    if (target.flags & ts.SymbolFlags.Value) {
      const t = checker.getTypeOfSymbolAtLocation(target, target.valueDeclaration ?? decl)
      const calls = t.getCallSignatures()
      // 出口常數的資料(`export const fooMeta = { … } as const`,沒有型別註記):只比形狀
      const vdecl = target.valueDeclaration
      currentWiden = Boolean(vdecl && ts.isVariableDeclaration(vdecl) && !vdecl.type && vdecl.initializer && !calls.length)
      if (calls.length) {
        // 函式 / 元件:參數列與回傳。第一個參數是物件(元件的 props、hook 的選項)時攤平成成員另外量,簽名裡只寫 props —— 同一處改動不在兩個鍵各報一次;
        // 繼承來的外部成員(HTML 屬性)住處一律記成「出口名 + Props」,不跟著內部 interface / 交集的寫法變(否則重構就整串假紅)
        const propsType = calls[0].getParameters()[0] ? checker.getTypeOfSymbol(calls[0].getParameters()[0]) : null
        const propsParam = Boolean(propsType && isPropsLike(propsType))
        // 元件(大寫開頭、第一個參數是 props 物件)經 JSX 呼叫,公開介面就是 props(下面攤平量),不比函式簽名(回傳 Element / ReactNode、React 傳的第二參數不是消費端寫的)
        if (!(propsParam && /^[A-Z]/.test(name))) signatures.set(`${name}()`, calls.map((s) => sigText(s, 0, { propsParam })).sort().join(' & '))
        if (propsParam) collectObject(propsType, name, `${name}Props`, true)
      } else if (t.flags & ts.TypeFlags.Object) {
        // 出口常數的物件:消費端只讀它(輸出),新增成員不是破壞
        collectObject(t, name, name, 'output')
      } else {
        signatures.set(name, `const ${norm(t)}`)
      }
    }
    drain()
  }
  // `declare module 'x' { interface Y { … } }`:擴充別的套件的型別(ColumnMeta)—— 出口裡看不到,但消費端寫欄位定義就在用
  for (const sf of program.getSourceFiles()) {
    if (!toPosix(sf.fileName).startsWith(`${toPosix(srcDir)}/`) || NOT_SHIPPED_SOURCE.test(toPosix(sf.fileName))) continue
    for (const st of sf.statements) {
      if (!ts.isModuleDeclaration(st) || !ts.isStringLiteral(st.name) || !st.body || !ts.isModuleBlock(st.body)) continue
      for (const inner of st.body.statements) {
        if (!ts.isInterfaceDeclaration(inner)) continue
        const sym = checker.getSymbolAtLocation(inner.name)
        if (!sym) continue
        currentAnchor = inner.name.text
        currentWiden = false
        // 擴充介面只量 DS 自己加的成員(套件原本的成員不歸 DS 管)
        const t = checker.getDeclaredTypeOfSymbol(sym)
        for (const prop of checker.getPropertiesOfType(t)) {
          const d = prop.valueDeclaration ?? prop.declarations?.[0]
          if (!d || !isDsDecl(d)) continue
          const key = `${inner.name.text}.${prop.name}`
          const optional = Boolean(prop.flags & ts.SymbolFlags.Optional)
          // 同 collectObject:有型別註記就用宣告處的型別,同一個鍵只有一種寫法
          const text = norm(ts.isPropertySignature(d) && d.type ? checker.getTypeFromTypeNode(d.type) : checker.getTypeOfSymbol(prop), 0, optional)
          if (!members.has(key)) members.set(key, { optional, texts: new Set(), at: at(d), anchors: new Set() })
          members.get(key).texts.add(text)
          members.get(key).anchors.add(inner.name.text)
          if (!anchorMembers.has(inner.name.text)) anchorMembers.set(inner.name.text, new Map())
          anchorMembers.get(inner.name.text).set(prop.name, { key, optional, text })
        }
        drain()
      }
    }
  }
  for (const m of members.values()) m.text = [...m.texts].sort().join(' ‖ ')
  return { members, anchorMembers, signatures }
}

// ── (e) 預設值 ──────────────────────────────────────────────────────────────────
/** 字面值初始式 → 正規化文字(物件 / 陣列遞迴;不是字面值回 null) */
function literalText(node) {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isTypeAssertionExpression?.(node))) node = node.expression
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return JSON.stringify(node.text)
  if (ts.isNumericLiteral(node)) return String(Number(node.text))
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return String(-Number(node.operand.text))
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null'
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map(literalText)
    return items.every((x) => x !== null) ? `[${items.join(',')}]` : null
  }
  if (ts.isObjectLiteralExpression(node)) {
    const items = []
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name))) return null
      const v = literalText(p.initializer)
      if (v === null) return null
      items.push(`${JSON.stringify(p.name.text)}:${v}`)
    }
    return `{${items.sort().join(',')}}`
  }
  return null
}

/** 預設值參數(解構預設)可以是字面值或指向常數的名字(`size = DEFAULT_SIZE`、`x = Foo.md`) */
const defaultText = (node) => literalText(node) ?? (node && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) ? node.getText() : null)

function functionOfComponent(init) {
  let n = init
  for (let guard = 0; n && guard < 4; guard += 1) {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return n
    if (ts.isCallExpression(n) && n.arguments.length) { n = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a) || ts.isCallExpression(a)) ?? null; continue }
    if (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression(n)) { n = n.expression; continue }
    return null
  }
  return null
}

function collectDefaults(checker, program, srcDir, exportEntries) {
  const out = new Map()
  const cvaVariants = new Map()
  const constants = []
  for (const sf of program.getSourceFiles()) {
    const rel = toPosix(relative(srcDir, sf.fileName))
    if (rel.startsWith('..') || NOT_SHIPPED_SOURCE.test(`/${rel}`) || sf.isDeclarationFile) continue
    const visit = (node) => {
      // cva(base, { variants, defaultVariants })
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'cva' && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const owner = ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent.name.text : null
        const dv = node.arguments[1].properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'defaultVariants')
        const vs = node.arguments[1].properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'variants')
        if (owner && vs && ts.isObjectLiteralExpression(vs.initializer)) cvaVariants.set(owner, new Set(vs.initializer.properties.filter((p) => p.name).map((p) => p.name.getText(sf).replace(/^['"]|['"]$/g, ''))))
        if (owner && dv && ts.isObjectLiteralExpression(dv.initializer)) {
          for (const p of dv.initializer.properties) {
            if (!ts.isPropertyAssignment(p)) continue
            const v = literalText(p.initializer)
            if (v !== null) out.set(`${owner}.${p.name.getText(sf).replace(/^['"]|['"]$/g, '')}`, { value: v, at: `${rel}:${sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1}`, kind: 'cva' })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (/^(components|patterns)\//.test(rel)) {
      // 「以具名常數表達的預設」:常數名帶 DEFAULT,或同一檔裡被拿來當預設 —— 參數 / 解構的預設值、`??` / `||` 的後備值
      // (`width ?? DIALOG_WIDTH_TIERS.md`)。只當實作細節的常數(class 字串、探針表)不算預設,改了不必登記。
      const usedAsDefault = new Set()
      const rootName = (e) => { while (e && (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e) || ts.isParenthesizedExpression(e))) e = e.expression; return e && ts.isIdentifier(e) ? e.text : null }
      const scan = (node) => {
        if ((ts.isBindingElement(node) || ts.isParameter(node)) && node.initializer) { const r = rootName(node.initializer); if (r) usedAsDefault.add(r) }
        if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) { const r = rootName(node.right); if (r) usedAsDefault.add(r) }
        ts.forEachChild(node, scan)
      }
      scan(sf)
      for (const st of sf.statements) {
        if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !/^[A-Z][A-Z0-9_]{2,}$/.test(d.name.text) || !d.initializer) continue
          if (!d.name.text.includes('DEFAULT') && !usedAsDefault.has(d.name.text)) continue
          const v = literalText(d.initializer)
          if (v !== null) constants.push({ name: d.name.text, rel, value: v, line: sf.getLineAndCharacterOfPosition(d.getStart(sf)).line + 1 })
        }
      }
    }
  }
  const counts = new Map()
  for (const c of constants) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  for (const c of constants) out.set(counts.get(c.name) === 1 ? c.name : `${c.rel}#${c.name}`, { value: c.value, at: `${c.rel}:${c.line}`, kind: 'constant' })
  // 出口元件參數解構的預設:`({ size = 'md' })` / forwardRef(({ maxWidth = '512px' }, ref) => …)
  for (const { name, symbol } of exportEntries) {
    let target = symbol
    if (symbol.flags & ts.SymbolFlags.Alias) { try { target = checker.getAliasedSymbol(symbol) } catch { target = symbol } }
    const decl = target.valueDeclaration
    if (!decl || !/^[A-Z]/.test(name)) continue
    const fn = ts.isFunctionDeclaration(decl) ? decl : ts.isVariableDeclaration(decl) && decl.initializer ? functionOfComponent(decl.initializer) : null
    const param = fn?.parameters?.[0]
    if (!param || !ts.isObjectBindingPattern(param.name)) continue
    const sf = decl.getSourceFile()
    const rel = toPosix(relative(srcDir, sf.fileName))
    if (rel.startsWith('..')) continue
    const localToProp = new Map()
    for (const el of param.name.elements) {
      if (el.dotDotDotToken) continue
      const prop = (el.propertyName ?? el.name)
      if (!ts.isIdentifier(prop) && !ts.isStringLiteral(prop)) continue
      if (ts.isIdentifier(el.name)) localToProp.set(el.name.text, prop.text)
      if (!el.initializer) continue
      const v = defaultText(el.initializer)
      if (v !== null) out.set(`${name}.${prop.text}`, { value: v, at: `${rel}:${sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1}`, kind: 'param' })
    }
    // 本體裡對解構出來的參數寫的後備值:`size ?? 'lg'`、`labelProp ?? t('ns', 'key', '預設')`(最後一個字面值引數)
    // 本體裡的 const(`const inherited = useRowSize('md')` 再寫 `sizeProp ?? inherited`):後備值指到它就跟到它的初始式
    const localInit = new Map()
    const collectLocals = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const)) localInit.set(node.name.text, node.initializer)
      ts.forEachChild(node, collectLocals)
    }
    if (fn.body) collectLocals(fn.body)
    const fallbackOf = (e, depth = 0) => {
      while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e))) e = e.expression
      const lit = literalText(e)
      if (lit !== null) return lit
      if (e && ts.isCallExpression(e) && e.arguments.length) return literalText(e.arguments[e.arguments.length - 1])
      if (e && ts.isIdentifier(e) && localInit.has(e.text) && depth < 3) return fallbackOf(localInit.get(e.text), depth + 1)
      return null
    }
    const scanBody = (node) => {
      if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
        && ts.isIdentifier(node.left) && localToProp.has(node.left.text)) {
        const key = `${name}.${localToProp.get(node.left.text)}`
        const v = fallbackOf(node.right)
        if (v !== null && !out.has(key)) out.set(key, { value: v, at: `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`, kind: 'fallback' })
      }
      ts.forEachChild(node, scanBody)
    }
    if (fn.body) scanBody(fn.body)
  }
  return { defaults: out, cvaVariants }
}

// ── (c)(d) CSS ─────────────────────────────────────────────────────────────────
/** 逗號分開的清單,括號裡的逗號不切(`:is(a, b)`、`:not(a, b)`) */
function splitTopLevelCommas(text) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const c of text) {
    if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth -= 1
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = '' } else cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** 拿掉 `:not(…)` 限定(含巢狀括號):它只決定「明給了更細的屬性時讓位」,不改「設了這個屬性的地方生效什麼值」 */
function stripNot(selector) {
  let out = ''
  for (let i = 0; i < selector.length; i += 1) {
    if (selector.startsWith(':not(', i)) {
      let depth = 0
      let j = i + 4
      for (; j < selector.length; j += 1) { if (selector[j] === '(') depth += 1; else if (selector[j] === ')') { depth -= 1; if (depth === 0) break } }
      i = j
      continue
    }
    out += selector[i]
  }
  return out.trim()
}

/**
 * 區塊開頭(選擇器 / at-rule)→ 它代表的情境清單。選擇器清單逐個拆開(`[data-ui-size="lg"], [data-density="lg"]` 是兩個情境,
 * 拆成兩條或合成一條都不算改);`:root` / `@theme` / `html` 是 base;`:not(…)` 限定不算情境的一部分。at-rule 整串當一個情境。
 */
function blockContexts(prelude) {
  const text = prelude.trim().replace(/\s+/g, ' ')
  if (text.startsWith('@')) return [/^@theme( inline)?$/.test(text) ? 'base' : text]
  return [...new Set(splitTopLevelCommas(text).map((sel) => (/^(:root|html)$/.test(sel) ? 'base' : stripNot(sel) || 'base')))]
}

/** 一份 CSS 的自訂屬性宣告:[{ name, value, context }](context = 外層區塊的情境串,逐層展開成每一種組合;base 層不寫進情境) */
function cssDeclarations(body) {
  const out = []
  const stack = []
  let buf = ''
  const flush = () => {
    const m = /^\s*(--[A-Za-z0-9_-]+)\s*:([\s\S]*)$/.exec(buf)
    if (m) {
      let combos = [[]]
      for (const alternatives of stack) combos = combos.flatMap((prefix) => alternatives.map((alt) => (alt === 'base' ? prefix : [...prefix, alt])))
      const value = m[2].trim().replace(/\s+/g, ' ')
      for (const ctx of new Set(combos.map((parts) => parts.join(' > ') || 'base'))) out.push({ name: m[1], value, context: ctx })
    }
    buf = ''
  }
  for (const c of body) {
    if (c === '{') { stack.push(blockContexts(buf)); buf = '' }
    else if (c === '}') { flush(); stack.pop() }
    else if (c === ';') flush()
    else buf += c
  }
  return out
}

export function cssSurface(cssFiles) {
  const cssVars = new Map()
  const utilities = new Map()
  const decls = []
  for (const [rel, text] of cssFiles) {
    const body = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    const lineOf = (i) => body.slice(0, i).split('\n').length
    for (const m of body.matchAll(/(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)) {
      const before = body.slice(Math.max(0, m.index - 12), m.index + m[1].length)
      if (/@property\s*$/.test(before)) continue
      if (!cssVars.has(m[2])) cssVars.set(m[2], `${rel}:${lineOf(m.index + m[1].length)}`)
    }
    for (const m of body.matchAll(/@utility\s+([A-Za-z0-9_*-]+)\s*\{/g)) if (!utilities.has(m[1])) utilities.set(m[1], `${rel}:${lineOf(m.index)}`)
    decls.push(...cssDeclarations(body))
  }
  // 值:var() 串接解開成最後的值再比(只是改成引用同值的另一個 token,不算改值);同一個情境以後寫的為準
  const byContext = new Map()
  for (const d of decls) {
    if (!byContext.has(d.context)) byContext.set(d.context, new Map())
    byContext.get(d.context).set(d.name, d.value)
  }
  const cssValues = new Map()
  for (const [context, map] of byContext) for (const name of map.keys()) cssValues.set(`${name} @ ${context}`, effectiveCssValue(byContext, name, context))
  return { cssVars, cssValues, cssByContext: byContext, utilities }
}

/**
 * 某個情境裡這個自訂屬性實際生效的值:情境自己有宣告就用它,沒有就繼承 base(:root / @theme / html),var() 一路解開。
 * 拿掉某個情境的覆寫(例:刪掉 [data-theme="dark"] 的 --x,:root 還在)時,那個情境的生效值變成 base 的值 —— 比的是這個生效值。
 * 回傳 undefined = 這個情境與 base 都沒有這個名字。
 */
export function effectiveCssValue(byContext, name, context) {
  const lookup = (n) => byContext.get(context)?.get(n) ?? byContext.get('base')?.get(n)
  const resolve = (value, depth = 0) => (depth > 12 ? value : value.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (all, n, fb) => {
    const v = lookup(n)
    if (v !== undefined) return resolve(v, depth + 1)
    return fb !== undefined ? resolve(fb.trim(), depth + 1) : all
  }))
  const raw = lookup(name)
  return raw === undefined ? undefined : resolve(raw).replace(/\s+/g, ' ')
}

// ── 整棵樹 ─────────────────────────────────────────────────────────────────────
/**
 * treeRoot = 含 packages/design-system 的樹根(工作樹 = repo 根;舊 tag = git archive 解開的暫存資料夾)。
 * repoRoot = 真的 repo 根(取 node_modules)。
 */
export function measureSurface(treeRoot, repoRoot) {
  const pkgDir = join(treeRoot, PKG_REL)
  const srcDir = join(pkgDir, 'src')
  if (!existsSync(srcDir)) throw new SurfaceInstrumentError(`讀不到 ${srcDir}`)
  const subpaths = enumerateSubpaths(pkgDir)
  const moduleRoots = [...subpaths.values()].filter((s) => s.module && s.file).map((s) => s.file)
  if (!moduleRoots.length) throw new SurfaceInstrumentError(`${pkgDir} 的 exports 沒有任何模組子路徑`)
  const program = createProgram(pkgDir, moduleRoots, repoRoot)
  const checker = program.getTypeChecker()
  const exportsMap = new Map()
  const entries = []
  const seenSymbol = new Set()
  for (const [subpath, s] of subpaths) {
    if (!s.module || !s.file) continue
    const sf = program.getSourceFile(s.file)
    const mod = sf && checker.getSymbolAtLocation(sf)
    if (!mod) { s.exports = 0; continue }
    const syms = checker.getExportsOfModule(mod)
    s.exports = syms.length
    for (const sym of syms) {
      const typeOnlySpecifier = (sym.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent?.parent?.isTypeOnly))
      let target = sym
      if (sym.flags & ts.SymbolFlags.Alias) { try { target = checker.getAliasedSymbol(sym) } catch { target = sym } }
      const name = sym.escapedName.toString()
      const kind = !typeOnlySpecifier && (target.flags & ts.SymbolFlags.Value) ? 'value' : 'type'
      if (!exportsMap.has(name)) exportsMap.set(name, new Map())
      exportsMap.get(name).set(subpath, kind)
      const key = `${name}@${target.id ?? name}`
      if (!seenSymbol.has(key)) { seenSymbol.add(key); entries.push({ name, symbol: sym }) }
    }
  }
  const { members, anchorMembers, signatures } = collectMembers(checker, program, srcDir, entries)
  const { defaults, cvaVariants } = collectDefaults(checker, program, srcDir, entries)
  const cssFiles = walkFiles(srcDir).filter((abs) => abs.endsWith('.css')).map((abs) => [toPosix(relative(pkgDir, abs)), readFileSync(abs, 'utf8')])
  const { cssVars, cssValues, cssByContext, utilities } = cssSurface(cssFiles)
  return { subpaths, exports: exportsMap, members, anchorMembers, signatures, cssVars, cssValues, cssByContext, utilities, defaults, cvaVariants }
}

// ── 比對:舊快照 → 新快照的破壞性差異(新增不算)──────────────────────────────────────
const coveredBy = (lit, shape) => (shape.lits.includes(lit))
  || (shape.str && lit.startsWith('"'))
  || (shape.num && /^-?\d/.test(lit))

/**
 * 純函式:兩份 measureSurface() 結果 → [{ surface, target, change, detail, at }]。
 * surface ∈ subpath / export / prop / type / token / class / default;change ∈ removed / required / narrowed / default。
 */
export function diffSurfaces(before, after) {
  const out = []
  const push = (surface, target, change, detail, at = '') => out.push({ surface, target, change, detail, at })
  // (a) 子路徑:整個子路徑不見了,它的出口不再逐一列(同一件事)
  const goneSubpaths = new Set()
  for (const [sp] of before.subpaths) if (!after.subpaths.has(sp)) { goneSubpaths.add(sp); push('subpath', sp, 'removed', '子路徑不見了') }
  // 出口:以名字為單位(root 與元件子路徑的同一個名字是同一件事);detail 列出從哪些子路徑消失
  const goneExports = new Set()
  for (const [name, bySp] of before.exports) {
    const now = after.exports.get(name) ?? new Map()
    const lost = [...bySp.keys()].filter((sp) => !now.has(sp) && !goneSubpaths.has(sp))
    const demoted = [...bySp].filter(([sp, k]) => k === 'value' && now.get(sp) === 'type').map(([sp]) => sp)
    if (lost.length) { goneExports.add(name); push('export', name, 'removed', `從 ${lost.join('、')} 拿掉`) }
    else if (demoted.length) push('export', name, 'narrowed', `在 ${demoted.join('、')} 從執行期出口降成只剩型別`)
  }
  // (b) 型別成員(解析後的全文比對;上一層成員整個不見 → 底下的巢狀成員不再逐一列)
  const goneMembers = new Set([...before.members.keys()].filter((k) => !after.members.has(k)))
  const parentGone = (key) => { for (let i = key.lastIndexOf('.'); i > 0; i = key.lastIndexOf('.', i - 1)) if (goneMembers.has(key.slice(0, i))) return true; return false }
  // 元件參數(prop)= 住處名結尾 Props / Labels,或住處就是一個出口元件(行內寫的 props 型別,例 SidebarHeader 的 withTabs);其餘 = 型別成員
  const isComponent = (name) => /^[A-Z]/.test(name) && [...(before.exports.get(name)?.values() ?? [])].includes('value')
  const surfaceOf = (key) => (/(Props|Labels)\./.test(key) || isComponent(key.slice(0, key.indexOf('.'))) ? 'prop' : 'type')
  const anchorGone = (a) => goneExports.has(a) || (!after.exports.has(a) && !after.anchorMembers.has(a))
  for (const [key, m] of before.members) {
    const surface = surfaceOf(key)
    const now = after.members.get(key)
    if (!now) {
      if (parentGone(key)) continue
      const member = key.slice(key.lastIndexOf('.') + 1)
      const anchors = [...m.anchors]
      if (anchors.length && anchors.every(anchorGone)) continue
      // 成員搬到別的 interface:每個錨點都還直接帶同名成員、型別全文相同、沒有變必填 → 消費端寫法不變;否則照樣報
      const moved = anchors.filter((a) => !anchorGone(a)).map((a) => [a, after.anchorMembers.get(a)?.get(member), before.anchorMembers.get(a)?.get(member)])
      if (anchors.length && moved.every(([, n]) => n)) {
        const changed = moved.filter(([, n, o]) => n.text !== (o?.text ?? m.text) || (!n.optional && (o?.optional ?? m.optional)))
        if (!changed.length) continue
        const [, n] = changed[0]
        push(surface, key, n.optional || !(m.optional) ? 'narrowed' : 'required', `搬到 ${n.key},型別 ${m.text} → ${n.text}${!n.optional && m.optional ? '(且變必填)' : ''}`, m.at)
        continue
      }
      push(surface, key, 'removed', `成員不見了(${m.at})`, m.at)
      continue
    }
    const required = m.optional && !now.optional
    // 元件參數(消費端給值的一方)只多收了值(舊的聯集每一支都還在)= 純新增,跟新的選填成員一樣不用登記;
    // 其餘(型別成員、回呼參數、回傳 —— 消費端讀值的一方)任何改變都算
    const parts = (t) => new Set(splitUnion(t))
    const widenedOnly = surface === 'prop' && !m.text.includes('‖') && !now.text.includes('‖') && [...parts(m.text)].every((x) => parts(now.text).has(x))
    const typeChanged = m.text !== now.text && !widenedOnly
    if (required) push(surface, key, 'required', `選填變必填${typeChanged ? `,型別 ${m.text} → ${now.text}` : ''}(${now.at})`, now.at)
    else if (typeChanged) push(surface, key, 'narrowed', `型別 ${m.text} → ${now.text}(${now.at})`, now.at)
  }
  // 既有的錨點(出口 / 擴充介面)新增必填成員:消費端原本的寫法少了它就編不過
  const reported = new Set(out.map((d) => d.target))
  for (const [anchor, nowMembers] of after.anchorMembers) {
    const old = before.anchorMembers.get(anchor)
    if (!old) continue
    for (const [member, n] of nowMembers) {
      if (old.has(member) || n.optional || n.input === false || reported.has(n.key) || before.members.has(n.key)) continue
      reported.add(n.key)
      push(surfaceOf(n.key), n.key, 'required', `既有的 ${anchor} 新增必填成員(型別 ${n.text})`, after.members.get(n.key)?.at ?? '')
    }
  }
  // 出口的簽名(函式的參數列與回傳)、非物件型別(聯集 / 字面值 / 函式型別)的展開全文
  for (const [key, text] of before.signatures) {
    const now = after.signatures.get(key)
    const name = key.replace(/\(\)$/, '')
    if (now === undefined || goneExports.has(name)) continue
    if (now !== text) push(key.endsWith('()') ? 'export' : 'type', name, 'narrowed', `${key.endsWith('()') ? '簽名' : '型別'} ${text} → ${now}`)
  }
  // (c)(d) CSS
  for (const [name, at] of before.cssVars) if (!after.cssVars.has(name)) push('token', name, 'removed', `出貨 CSS 不再宣告(原 ${at})`, at)
  for (const [name, at] of before.utilities) if (!after.utilities.has(name)) push('class', name, 'removed', `@utility 不再提供(原 ${at})`, at)
  // CSS 自訂屬性的值(var() 解開後):舊樹宣告過的每個「名字 @ 情境」,拿新樹同一個情境實際生效的值來比
  // (新樹拿掉了那個情境的覆寫 → 生效值改成繼承 base 的值,也算改值);名字整個不見由上面的「拿掉」報
  const valueChanged = new Map()
  for (const [key, value] of before.cssValues ?? []) {
    const [name, context] = key.split(' @ ')
    if (!after.cssVars.has(name)) continue
    const now = after.cssValues?.get(key) ?? (after.cssByContext ? effectiveCssValue(after.cssByContext, name, context) ?? '(這個情境不再有值)' : undefined)
    if (now === undefined || now === value) continue
    if (!valueChanged.has(name)) valueChanged.set(name, [])
    valueChanged.get(name).push(`${context}: ${value} → ${now}`)
  }
  for (const [name, list] of valueChanged) push('token', name, 'default', `值改了(${list.join(';')})`)
  // (e) 預設值:兩邊都有、值不同 = 預設改了;cva 的某個 defaultVariants 鍵不見但那支 cva 還在 = 預設拿掉
  // (變體本身拿掉 = 參數改名 / 移除,那一條在型別成員;這裡只管「變體還在、預設拿掉」)
  for (const [key, d] of before.defaults) {
    const now = after.defaults.get(key)
    const dot = key.lastIndexOf('.')
    if (now && now.value !== d.value) push('default', key, 'default', `${d.value} → ${now.value}(${now.at})`, now.at)
    else if (!now && d.kind === 'cva' && after.cvaVariants?.get(key.slice(0, dot))?.has(key.slice(dot + 1))) push('default', key, 'default', `${d.value} → (不再有預設)`, d.at)
    // 元件參數的預設整個拿掉、參數還在(參數本身拿掉 / 改名由型別成員那一條報)
    else if (!now && (d.kind === 'param' || d.kind === 'fallback') && after.anchorMembers.get(key.slice(0, dot))?.has(key.slice(dot + 1))) push('default', key, 'default', `${d.value} → (不再有預設)`, d.at)
  }
  return out.sort((a, b) => (a.surface + a.target).localeCompare(b.surface + b.target))
}

/** 「改名的 to 存在嗎」:同一套鍵在新快照裡查 */
export function surfaceHas(snapshot, surface, target) {
  switch (surface) {
    case 'subpath': return snapshot.subpaths.has(target)
    case 'export': return snapshot.exports.has(target)
    case 'prop': case 'type': return snapshot.members.has(target)
    case 'token': return snapshot.cssVars.has(target)
    case 'class': return snapshot.utilities.has(target)
    case 'default': return snapshot.defaults.has(target)
    default: return false
  }
}
