import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = 'packages/design-system/src'

// Scan components/ — each subdir has <kebab-name>.tsx as main entry
const componentsDir = path.join(ROOT, 'components')
const componentDirs = fs.readdirSync(componentsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

const patternsDir = path.join(ROOT, 'patterns')
const patternDirs = fs.readdirSync(patternsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

// 2026-07-08 WM root-cause(CAT_SOLID 未 export):tokens JS mirrors(categorical-color /
// icon-size / motion / overlay-geometry)是 token SSOT 的程式面,consumer 需要(WM TypeIcon
// 被迫手刻 text-white 埋 contrast bug 實證)。遞迴收 tokens/**/*.ts 進 barrel。
function collectTokenTs(dir, acc = [], rel = '') {
  for (const e of fs.readdirSync(path.join(ROOT, 'tokens', rel), { withFileTypes: true })) {
    if (e.isDirectory()) collectTokenTs(dir, acc, path.join(rel, e.name))
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.endsWith('.spec.ts'))
      acc.push(path.join(rel, e.name).replace(/\\/g, '/'))
  }
  return acc
}
const tokenTs = collectTokenTs()
const hooks = fs.readdirSync(path.join(ROOT, 'hooks'))
  .filter(f => f.endsWith('.ts'))

const lib = fs.readdirSync(path.join(ROOT, 'lib'))
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))

// Kebab-case component dir → matching .tsx file inside
function pascalToKebab(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// Export-surface extraction(2026-07-14 API 策展 B,user 拍板「全部收窄」):
// root barrel 從 `export * from './components/X/index'` 收窄為「named re-exports 排除
// /Meta$/」— 62 個 `<camel>Meta`(componentMeta,建置/稽核 metadata:compile-stories /
// audit-story-quality 用)不屬 consumer front-door API。per-component index.ts 仍
// `export *`(subpath `@qijenchen/design-system/components/<Dir>` 消費不變,內部工具不壞)。
//
// 做法:TypeScript parser 語法層列舉每個 index.ts 的完整 export 名單(遞迴 `export * from`
// 相對鏈),分 value / type 兩桶(isolatedModules 要求 type-only 走 `export type`)。
// **Fail-loud 鐵律**(對齊 feedback_ai_ground_truth_unreliable + rsync 靜默陷阱教訓):
// 任何本 walker 不認得的 export 形式 / 解析不到的 module / 名字碰撞 → throw / exit 1,
// 絕不靜默丟 export(DT-EXPORT「文件教得到、import 拿不到」斷鏈 = 本 repo 已付過的學費)。
// 安全網:tsc -b + build:lib(dts emit)會對 named list 逐名驗存在。
// ─────────────────────────────────────────────────────────────────────────────

/** memo: absPath → Map<name, { kind: 'value'|'type', origin: '<declFile>#<name>' }>
 *  origin = 宣告點 identity — 同一 declaration 多路徑 re-export(如 ICON_SIZE 由
 *  patterns/element-anatomy 宣告、tokens/uiSize/icon-size.ts mirror)不是碰撞;
 *  不同宣告同名才是(fail-loud)。對齊 ES module spec「star-export 同 binding 不 ambiguous」。*/
const moduleExportsCache = new Map()
const inProgress = new Set()

function resolveModule(fromFile, spec) {
  let base
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec)
  } else if (spec.startsWith('@/design-system/')) {
    // tsconfig paths alias SSOT:@/design-system/* → packages/design-system/src/*
    base = path.resolve(ROOT, spec.slice('@/design-system/'.length))
  } else if (spec.startsWith('@/lib/')) {
    base = path.resolve(ROOT, 'lib', spec.slice('@/lib/'.length))
  } else {
    throw new Error(`[gen-barrel] ${fromFile}: re-export from external module '${spec}' 不支援(需人工決策)`)
  }
  for (const cand of [base + '.tsx', base + '.ts', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(cand)) return cand
  }
  throw new Error(`[gen-barrel] ${fromFile}: 解析不到 '${spec}'(tried .tsx/.ts/index)`)
}

function mergeKind(map, name, kind, origin, ctxPath) {
  const prev = map.get(name)
  if (!prev) { map.set(name, { kind, origin }); return }
  if (prev.origin !== origin) {
    // 同 module 內同名不同宣告(ES star-export ambiguity = 靜默雙消失)→ fail-loud 人工解
    throw new Error(`[gen-barrel] ${ctxPath}: '${name}' 在同 module 有兩個不同宣告來源(${prev.origin} vs ${origin})— ambiguous export,請解重名`)
  }
  // declaration merging(const X + type X 同宣告點)→ value 勝(value re-export 同時帶 type meaning)
  if (prev.kind !== 'value' && kind === 'value') prev.kind = 'value'
}

function hasExportModifier(node) {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
}

/** Collect the full export surface of a module file. Returns Map<name, 'value'|'type'>. */
function collectModuleExports(absPath) {
  if (moduleExportsCache.has(absPath)) return moduleExportsCache.get(absPath)
  if (inProgress.has(absPath)) {
    throw new Error(`[gen-barrel] export-star cycle involving ${absPath} — 不支援,請解環`)
  }
  inProgress.add(absPath)

  const src = ts.createSourceFile(
    absPath,
    fs.readFileSync(absPath, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  /** top-level 本地宣告 name → 'value'|'type'|'import'(供 `export { A }` 無 from 子句查 kind)*/
  const localDecls = new Map()
  /** import 進來的名字 → 來源(供「import 後 export { A }」轉出口歸類,如 data-table-filter-panel)*/
  const importedFrom = new Map()
  const localMerge = (name, kind) => {
    const prev = localDecls.get(name)
    if (prev === 'value') return
    if (kind === 'value' || prev === undefined || prev === 'import') localDecls.set(name, kind)
  }
  const exportsMap = new Map()

  for (const stmt of src.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          if (hasExportModifier(stmt)) throw new Error(`[gen-barrel] ${absPath}: exported destructuring 宣告不支援`)
          continue
        }
        localMerge(decl.name.text, 'value')
        if (hasExportModifier(stmt)) mergeKind(exportsMap, decl.name.text, 'value', `${absPath}#${decl.name.text}`, absPath)
      }
    } else if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
      if (!stmt.name) continue // export default anonymous — root barrel 不收 default
      localMerge(stmt.name.text, 'value')
      if (hasExportModifier(stmt)) mergeKind(exportsMap, stmt.name.text, 'value', `${absPath}#${stmt.name.text}`, absPath)
    } else if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) {
      localMerge(stmt.name.text, 'type')
      if (hasExportModifier(stmt)) mergeKind(exportsMap, stmt.name.text, 'type', `${absPath}#${stmt.name.text}`, absPath)
    } else if (ts.isModuleDeclaration(stmt)) {
      if (hasExportModifier(stmt)) throw new Error(`[gen-barrel] ${absPath}: exported namespace 不支援(value/type 二義)`)
    } else if (ts.isImportDeclaration(stmt)) {
      const c = stmt.importClause
      if (!c) continue
      const spec = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null
      if (c.name) localMerge(c.name.text, 'import')
      if (c.namedBindings) {
        if (ts.isNamespaceImport(c.namedBindings)) localMerge(c.namedBindings.name.text, 'import')
        else for (const el of c.namedBindings.elements) {
          localMerge(el.name.text, 'import')
          if (spec) importedFrom.set(el.name.text, {
            spec,
            sourceName: (el.propertyName ?? el.name).text,
            typeOnly: c.isTypeOnly || el.isTypeOnly,
          })
        }
      }
    } else if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier) {
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) throw new Error(`[gen-barrel] ${absPath}: 非字面 module specifier`)
        const target = resolveModule(absPath, stmt.moduleSpecifier.text)
        if (!stmt.exportClause) {
          // export * from './x' — 遞迴合併(origin 透傳,同 binding 不算 ambiguous)
          for (const [name, entry] of collectModuleExports(target)) mergeKind(exportsMap, name, entry.kind, entry.origin, absPath)
        } else if (ts.isNamedExports(stmt.exportClause)) {
          const targetExports = collectModuleExports(target)
          for (const el of stmt.exportClause.elements) {
            const sourceName = (el.propertyName ?? el.name).text
            const exportedName = el.name.text
            const entry = targetExports.get(sourceName)
            if (!entry) throw new Error(`[gen-barrel] ${absPath}: re-export '${sourceName}' 在 ${target} 找不到`)
            const kind = (stmt.isTypeOnly || el.isTypeOnly) ? 'type' : entry.kind
            mergeKind(exportsMap, exportedName, kind, entry.origin, absPath)
          }
        } else {
          throw new Error(`[gen-barrel] ${absPath}: export * as ns 不支援`)
        }
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        // export { A, type B }(本地 / import 轉出口)
        for (const el of stmt.exportClause.elements) {
          const sourceName = (el.propertyName ?? el.name).text
          const exportedName = el.name.text
          const typeOnly = stmt.isTypeOnly || el.isTypeOnly
          const localKind = localDecls.get(sourceName)
          if (localKind === 'import' || (typeOnly && importedFrom.has(sourceName))) {
            // import 後轉出口(如 data-table-filter-panel 的 createEmptyFilterTree / type Conjunction)
            // → 追進 import 來源取 kind + origin
            const imp = importedFrom.get(sourceName)
            if (!imp) throw new Error(`[gen-barrel] ${absPath}: export { ${sourceName} } 是 default/namespace import 轉出口 — 不支援`)
            const entry = collectModuleExports(resolveModule(absPath, imp.spec)).get(imp.sourceName)
            if (!entry) throw new Error(`[gen-barrel] ${absPath}: export { ${sourceName} } 轉出口在 ${imp.spec} 找不到 '${imp.sourceName}'`)
            mergeKind(exportsMap, exportedName, (typeOnly || imp.typeOnly) ? 'type' : entry.kind, entry.origin, absPath)
            continue
          }
          if (typeOnly) { mergeKind(exportsMap, exportedName, 'type', `${absPath}#${sourceName}`, absPath); continue }
          if (!localKind) {
            throw new Error(`[gen-barrel] ${absPath}: export { ${sourceName} } 無法歸類(未知本地宣告)— 補 walker 規則或改寫來源`)
          }
          mergeKind(exportsMap, exportedName, localKind, `${absPath}#${sourceName}`, absPath)
        }
      }
    } else if (ts.isExportAssignment(stmt)) {
      // export default expr — root barrel 不收 default
      continue
    }
  }

  exportsMap.delete('default')
  inProgress.delete(absPath)
  moduleExportsCache.set(absPath, exportsMap)
  return exportsMap
}

// 2026-06-05 dim-72 SSOT(user Q2 拍板「internal 不得直接 front-door 使用,包裝後+自行確認即可」):
// internal 元件/pattern 不進 root barrel(front-door),僅留 per-component subpath
// (@qijenchen/design-system/components/<Dir>,gen-component-indexes.mjs 仍生成)供「包裝後使用」。
// SSOT signal = 主 spec.md frontmatter `- isInternal`(component)或 `internal: true`(pattern)。
// 偵測 2 訊號(穩健,避免 main spec 檔名 ≠ dir-kebab 漏判,如 Menu→menu-item.spec.md):
//   (1) storybook title 落在 `Design System/Internal[/| ]`(所有有 stories 的 internal 元件/pattern)
//   (2) 無 stories 的 internal pattern:dir-named spec frontmatter `- isInternal` / `internal: true`
// element-anatomy 維持 public:其 stories title 是 `…/Patterns/Item Anatomy`(無 /Internal),
// 且無 `element-anatomy.spec.md`(主 spec 為 item-anatomy.spec.md,public)→ 不誤排除。
function isInternalDir(dirPath, dirKebab) {
  const files = fs.readdirSync(dirPath)
  for (const f of files.filter(f => f.endsWith('.stories.tsx'))) {
    const t = fs.readFileSync(path.join(dirPath, f), 'utf8')
    if (/title:\s*['"`][^'"`]*\/Internal[/ ]/.test(t)) return true
  }
  const spec = `${dirKebab}.spec.md`
  if (files.includes(spec)) {
    const fm = fs.readFileSync(path.join(dirPath, spec), 'utf8').match(/^---\n([\s\S]*?)\n---/)
    if (fm && (/^\s*-\s*isInternal\s*$/m.test(fm[1]) || /^\s*internal:\s*true\s*$/m.test(fm[1]))) return true
  }
  return false
}
const internalExcluded = []

// dim-44 marker gate(2026-06-11 R2 #28):internal 單元 tsx 必帶 `@internal` jsDoc marker
// (per `.claude/rules/ui-development.md`「export jsDoc 加 @internal marker(IDE intellisense 警示 end-user)」)。
// 偵測:internal dir 內所有非 stories / 非 `_` 前綴 .tsx 至少一檔含 `@internal` → pass;
// 全缺 → 記入 internalMissingMarker,--check 時 fail(release:preflight 防 regression)。
const internalMissingMarker = []
function hasInternalMarker(dirPath) {
  const tsx = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.tsx') && !f.includes('.stories.') && !f.startsWith('_'))
  return tsx.some(f => fs.readFileSync(path.join(dirPath, f), 'utf8').includes('@internal'))
}

// 全 barrel 名字碰撞防線(named re-export 下,跨 module 同名不同宣告 = tsc 重複 export 錯;
// 舊 `export *` 語義是「二義名靜默雙雙消失」— 收窄後改 fail-loud,API 消失必須被看見)。
// 同 origin(同一 declaration 多路徑 re-export,如 ICON_SIZE/RowSize 由 element-anatomy 宣告、
// tokens/uiSize/icon-size.ts mirror)= 合法,不算碰撞(ES spec:same binding 不 ambiguous)。
const nameOwner = new Map() // name → { ownerLabel, origin }
const collisions = []
function registerStarNames(entries, ownerLabel) {
  for (const [name, { origin }] of entries) {
    const prev = nameOwner.get(name)
    if (!prev) { nameOwner.set(name, { ownerLabel, origin }); continue }
    if (prev.origin !== origin) collisions.push(`${name}(${prev.ownerLabel} vs ${ownerLabel})`)
    // same-origin → OK:前面 named section 的 explicit export 依 ES 語義 shadow star,同 binding 無差異
  }
}

const metaExcludedNames = []

/** named re-export 區塊(value + type 兩段;名單排序保 deterministic --check)*/
function emitNamedReexports(indexAbsPath, fromSpecifier, ownerLabel, out) {
  if (!fs.existsSync(indexAbsPath)) {
    throw new Error(`[gen-barrel] ${ownerLabel}: index.ts 不存在 — 先跑 node scripts/gen-component-indexes.mjs 再跑本 generator`)
  }
  const all = collectModuleExports(indexAbsPath)
  const values = []
  const types = []
  for (const [name, { kind, origin }] of all) {
    // /Internal$/ 慣例:internal-by-convention 型別通道(FieldVariantInternal 等)
    // subpath-only,不進 root front-door(2026-07-14 API 策展 E 配套;value/type 皆擋)
    if (/Internal$/.test(name)) continue
    if (/Meta$/.test(name)) {
      // API 策展 B:componentMeta(建置/稽核 metadata)收窄出 front-door。
      // 防呆:僅預期 value 形式的 `<camel>Meta`;type 名撞上 /Meta$/ → fail-loud 人工決策。
      if (kind !== 'value' || !/^[a-z]/.test(name)) {
        throw new Error(`[gen-barrel] ${ownerLabel}: '${name}'(${kind})符合 /Meta$/ 但非 camelCase componentMeta 慣例 — 需人工決策是否收窄`)
      }
      metaExcludedNames.push(name)
      continue
    }
    const prev = nameOwner.get(name)
    if (prev) {
      if (prev.origin === origin) continue // 同 binding 已由較早 named section 出口 → skip 重複 explicit(tsc duplicate export)
      collisions.push(`${name}(${prev.ownerLabel} vs ${ownerLabel})`)
      continue
    }
    nameOwner.set(name, { ownerLabel, origin })
    ;(kind === 'value' ? values : types).push(name)
  }
  values.sort()
  types.sort()
  if (values.length === 0 && types.length === 0) {
    throw new Error(`[gen-barrel] ${ownerLabel}: index.ts 展開後 0 個 export — 上游 gen-component-indexes.mjs 是否未跑?`)
  }
  if (values.length) {
    out.push('export {')
    for (const n of values) out.push(`  ${n},`)
    out.push(`} from '${fromSpecifier}'`)
  }
  if (types.length) {
    out.push('export type {')
    for (const n of types) out.push(`  ${n},`)
    out.push(`} from '${fromSpecifier}'`)
  }
}

const exports = []
exports.push('// 2026-05-22 Phase 1 team-distribution-roadmap:barrel auto-generated by scripts/gen-design-system-barrel.mjs')
exports.push('// Re-export 主元件 / patterns / hooks / lib(consumers can also use subpath imports per package.json exports map)')
exports.push('// 2026-07-14 API 策展(user 拍板「全部收窄」):components/patterns 改 named re-exports,')
exports.push('//   全部 `<camel>Meta`(componentMeta 建置/稽核 metadata,非 consumer API)收窄出 front-door。')
exports.push('//   *Meta / internal 仍可經 per-component subpath(components/<Dir> 的 index.ts export *)消費。')
exports.push('')
exports.push('// ─── Components(named re-exports;/Meta$/ 收窄出 front-door)──────────────')
for (const dir of componentDirs.sort()) {
  // Find primary .tsx in dir(non-stories / non-anatomy)
  const dirPath = path.join(componentsDir, dir)
  const files = fs.readdirSync(dirPath)
  // Try kebab-case match first
  const kebab = pascalToKebab(dir)
  const candidates = [
    `${kebab}.tsx`,
    files.find(f => f.endsWith('.tsx') && !f.includes('.stories.') && !f.includes('_demo') && !f.startsWith('_')),
  ].filter(Boolean)
  const main = candidates.find(c => files.includes(c))
  if (main) {
    // dim-72:internal 元件不進 root barrel(只留 subpath);main spec frontmatter isInternal 判定。
    if (isInternalDir(dirPath, kebab)) {
      internalExcluded.push(`components/${dir}`)
      if (!hasInternalMarker(dirPath)) internalMissingMarker.push(`components/${dir}`)
      continue
    }
    // Phase 5.1 2026-05-25:route via /index re-export(per-component index.ts gen via scripts/gen-component-indexes.mjs)
    // → vite preserveModules emits dist/components/<Dir>/index.js matching package.json exports `./components/*`
    emitNamedReexports(
      path.resolve(dirPath, 'index.ts'),
      `./components/${dir}/index`,
      `components/${dir}`,
      exports,
    )
  }
}

exports.push('')
exports.push('// ─── Patterns(named re-exports;/Meta$/ 收窄出 front-door)────────────────')
for (const dir of patternDirs.sort()) {
  const dirPath = path.join(patternsDir, dir)
  const files = fs.readdirSync(dirPath)
  // 2026-05-31 fix(Release blocker since Phase 1):原以 `<dir-kebab>.tsx` 判定 main file,
  // 但 element-anatomy(主檔 item-anatomy.tsx)/ header-canonical(chrome-header.tsx)/
  // action-bar 的主檔名 ≠ dir 名 → 3 pattern 被漏 export → apps/template `import { ItemAvatar }`
  // 失敗 → storybook FULL build rollup 錯 → Release/npm publish 掛(beta.39/40)。改判 index.ts
  // 存在(barrel 本就 re-export `./patterns/${dir}/index`,index.ts auto-gen 必存在)。
  if (files.includes('index.ts')) {
    // dim-72:internal pattern(overlay-surface / horizontal-overflow)不進 root barrel。
    if (isInternalDir(dirPath, dir)) {
      internalExcluded.push(`patterns/${dir}`)
      if (!hasInternalMarker(dirPath)) internalMissingMarker.push(`patterns/${dir}`)
      continue
    }
    emitNamedReexports(
      path.resolve(dirPath, 'index.ts'),
      `./patterns/${dir}/index`,
      `patterns/${dir}`,
      exports,
    )
  }
}

exports.push('')
exports.push('// ─── Internal(subpath-only,排除 root front-door per dim-72 SSOT)─────────────')
exports.push('// 下列 internal 元件/pattern 不在 root barrel front-door;只能 subpath import')
exports.push('// (@qijenchen/design-system/{components,patterns}/<Dir>),「包裝後 + 自行確認」才可用。')
exports.push('// SSOT = 各自 spec.md frontmatter isInternal。改公開/內部請改 frontmatter 後重跑本 generator。')
for (const x of internalExcluded.sort()) exports.push(`//   - ${x}`)

exports.push('')
exports.push('// ─── Tokens(JS mirrors — token SSOT 程式面)──────────────────────────────')
for (const f of tokenTs.sort()) {
  registerStarNames(collectModuleExports(path.resolve(ROOT, 'tokens', f)), `tokens/${f}`)
  exports.push(`export * from './tokens/${f.replace(/\.ts$/, '')}'`)
}

exports.push('')
exports.push('// ─── Hooks ────────────────────────────────────────────────────────────────')
for (const f of hooks.sort()) {
  registerStarNames(collectModuleExports(path.resolve(ROOT, 'hooks', f)), `hooks/${f}`)
  exports.push(`export * from './hooks/${f.replace(/\.ts$/, '')}'`)
}

exports.push('')
exports.push('// ─── Lib utilities ────────────────────────────────────────────────────────')
for (const f of lib.sort()) {
  registerStarNames(collectModuleExports(path.resolve(ROOT, 'lib', f)), `lib/${f}`)
  exports.push(`export * from './lib/${f.replace(/\.ts$/, '')}'`)
}

exports.push('')

// 碰撞 fail-loud(named re-export 下 tsc 也會炸;這裡先給人話 + 定位)
if (collisions.length > 0) {
  console.error(`✗ root barrel 名字碰撞 ${collisions.length} 筆(named re-export 不允許;舊 export * 語義是靜默雙消失):`)
  for (const c of collisions) console.error(`   - ${c}`)
  process.exit(1)
}

const generated = exports.join('\n')
const target = path.join(ROOT, 'index.ts')

// --check mode(release:preflight 用):驗 committed index.ts == 重新生成,catch
// 「元件標 isInternal 但忘了重跑 generator → 仍漏在 root barrel front-door」這類 dim-72 drift
// + 「新增 export / *Meta 後未重生 → named 名單 drift」。
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  if (current.trim() !== generated.trim()) {
    console.error('✗ root barrel drift:packages/design-system/src/index.ts != 重新生成(可能 internal 標記 / export 名單改動未重跑 generator)。修:node scripts/gen-design-system-barrel.mjs')
    process.exit(1)
  }
  if (internalMissingMarker.length > 0) {
    console.error(`✗ dim-44 @internal marker 缺漏:${internalMissingMarker.join(', ')} — internal 單元 tsx 必帶 @internal jsDoc(ui-development.md Public vs Internal canonical)。修:在主 tsx 加 /** @internal — … */ file-header block(參照 horizontal-overflow.tsx)`)
    process.exit(1)
  }
  console.log(`✓ root barrel 對齊(internal subpath-only:${internalExcluded.length} 排除 front-door;@internal marker ${internalExcluded.length}/${internalExcluded.length} 齊;*Meta 收窄:${metaExcludedNames.length} 個)`)
  process.exit(0)
}

fs.writeFileSync(target, generated)
console.log('✓ generated', target, `with ${componentDirs.length} components / ${patternDirs.length} patterns / ${hooks.length} hooks / ${lib.length} lib`)
console.log(`  ↳ internal(subpath-only,排除 root barrel): ${internalExcluded.length} → ${internalExcluded.join(', ')}`)
console.log(`  ↳ *Meta 收窄出 front-door(subpath 仍有): ${metaExcludedNames.length} 個`)
