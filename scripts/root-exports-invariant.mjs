#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: npm root(`packages/design-system/src/index.ts`)上一次發布時有的出口,現在拿掉了(或從執行期出口降成只剩型別)
 *         就一定寫在 `scripts/root-exports-removals.json` 的 `releases["<上一次發布的 tag>"]`(名字 + 種類 + 理由)——
 *         那份清單就是發布說明「破壞性變更 → root 出口」的來源;沒寫 = consumer 升版直接 import 失敗,而且沒有人知道。
 *   紅: 拿掉沒寫明 / 寫了卻沒拿掉(過期登記)/ 種類寫錯 / 理由空白 / 清單還留著比上一次發布更早的 tag → 指名並 exit 1;
 *       給了 `--notes=<發布說明檔>`(GitHub Release / PR 說明存成文字檔)時,登記的名字有任何一個沒出現在那份說明裡 → 指名並 exit 1
 *       (發版前驗「這一版的說明草稿」;發版後、刪舊段之前驗「那一版實際發出去的說明」)。清單還留著舊 tag 時,沒給 --notes 只會叫你先驗,
 *       不會說「登記已隨說明發出去」—— 那句話只有在 --notes 驗過全部收錄之後才印(M37:不拿「JSON 裡有登記」當「發布說明有寫」)。
 *       `--selftest` 用兩棵合成小樹真的跑同一支比對(四種紅各一面、登記齊全的綠一面、發布說明漏寫 / 收錄 / 沒驗各一面)。
 *   綠: 拿掉的全部寫明;新增的出口只列出、不擋。
 *   儀器失效(exit 2): 找不到上一次發布的 tag、讀不到那個 tag 的 index.ts、任一邊算出 0 個出口 —— 不讀成通過。
 *
 * 為什麼(2026-10-21 r1b others 九-3):lib/README 有 owner 清單,C2(owner-claims)量得到;但 hook / 元件常數 / 型別
 * (`useIsNarrowViewport`、`AGENT_PANEL_SIDE_BY_SIDE_MIN_CONTAINER`、`StepsExpansion`)被拿掉時沒有任何機械面看得到 ——
 * 當時是手動用 dist 比的。本閘直接量性質本身:「上一次發布的 root 出口全集 vs 現在」(M37:不拿「有沒有改 index.ts」當代理)。
 * 量法:TypeScript 對 index.ts 取 module 的出口(`export *`、`export { … } from`、`export type` 全展開),每個名字分「執行期」
 * (值,dist 的 index.mjs 會有)與「只有型別」(只在 .d.ts);上一次發布那一邊用 `git archive <tag>` 取同一份原始碼 ——
 * 發布的 dist 由這份原始碼建置(package.json `files` 的 dist + src),兩邊用同一個量法比,不受建置環境影響。
 *
 * 用法:node scripts/root-exports-invariant.mjs [--selftest] [--tag=<tag>] [--notes=<發布說明文字檔>]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = 'packages/design-system/src/index.ts'
const REGISTRY = 'scripts/root-exports-removals.json'
export class InstrumentError extends Error {}

/** 一棵樹的 root 出口:Map<名字, 'value' | 'type'>(index.ts 取絕對路徑) */
export function rootExports(indexAbs) {
  if (!existsSync(indexAbs)) throw new InstrumentError(`讀不到 ${indexAbs}`)
  const program = ts.createProgram([indexAbs], {
    noEmit: true, allowJs: false, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, types: [],
  })
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(indexAbs)
  const mod = sf && checker.getSymbolAtLocation(sf)
  if (!mod) throw new InstrumentError(`${indexAbs} 不是 module(沒有任何 export?)`)
  const out = new Map()
  for (const sym of checker.getExportsOfModule(mod)) {
    // `export type { X }` / `export { type X }`:不論 X 本身是不是值,對外都只有型別
    const typeOnlySpecifier = (sym.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent?.parent?.isTypeOnly))
    let target = sym
    if (sym.flags & ts.SymbolFlags.Alias) { try { target = checker.getAliasedSymbol(sym) } catch { target = sym } }
    const isValue = !typeOnlySpecifier && Boolean(target.flags & ts.SymbolFlags.Value)
    out.set(sym.escapedName.toString(), isValue ? 'value' : 'type')
  }
  return out
}

/** 純函式:比對 + 對登記清單。released / current = Map<名字, kind>;entries = [{ name, kind, reason }] */
/** 發布說明裡沒出現的登記名字(整個識別字比對,不比子字串);notesText 空白 = 儀器失效 */
export function namesMissingFromNotes(entries, notesText) {
  if (typeof notesText !== 'string' || !notesText.trim()) throw new InstrumentError('--notes 給的發布說明是空的 —— 沒驗到不是通過')
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return entries.filter((e) => e?.name && !new RegExp(`(?<![\\w$])${esc(e.name)}(?![\\w$])`).test(notesText)).map((e) => e.name)
}

export function compareExports(released, current, registry, tag, notesText = null) {
  const problems = []
  const removed = []
  for (const [name, kind] of released) {
    const now = current.get(name)
    if (!now) removed.push({ name, kind })
    else if (kind === 'value' && now === 'type') removed.push({ name, kind: 'value', becameType: true })
  }
  const added = [...current.keys()].filter((n) => !released.has(n))
  const releases = registry?.releases ?? {}
  for (const k of Object.keys(releases)) {
    if (k === tag) continue
    const old = Array.isArray(releases[k]) ? releases[k] : []
    if (notesText === null) { problems.push(`${REGISTRY} releases["${k}"]:${k} 之後已經發布 ${tag} —— 刪這一段之前先證明 ${tag} 的發布說明寫了這 ${old.length} 個名字:把 ${tag} 的 GitHub Release / PR 說明存成文字檔,跑 node scripts/root-exports-invariant.mjs --notes=<檔>;全部收錄才刪`); continue }
    const missing = namesMissingFromNotes(old, notesText)
    problems.push(missing.length
      ? `${REGISTRY} releases["${k}"]:${tag} 的發布說明沒寫 ${missing.length} 個拿掉的出口(${missing.join('、')})—— 補進 ${tag} 的 GitHub Release 說明,再刪這一段`
      : `${REGISTRY} releases["${k}"]:已確認 ${tag} 的發布說明收錄了這 ${old.length} 個名字 → 刪掉這一段`)
  }
  const entries = releases[tag] ?? []
  const byName = new Map()
  entries.forEach((e, i) => {
    const at = `${REGISTRY} releases["${tag}"][${i}]`
    if (!e || typeof e.name !== 'string' || !e.name) { problems.push(`${at}:沒有 name`); return }
    if (byName.has(e.name)) problems.push(`${at}:「${e.name}」登記了兩次`)
    byName.set(e.name, e)
    if (e.kind !== 'value' && e.kind !== 'type') problems.push(`${at}:「${e.name}」kind 要寫 value(執行期)或 type(只有型別)`)
    if (typeof e.reason !== 'string' || !e.reason.trim()) problems.push(`${at}:「${e.name}」理由空白(發布說明要寫為什麼拿掉、consumer 改用什麼)`)
  })
  const removedNames = new Set(removed.map((r) => r.name))
  for (const r of removed) {
    const e = byName.get(r.name)
    const what = r.becameType ? `從執行期出口降成只剩型別` : `(${r.kind === 'value' ? '執行期' : '型別'})拿掉了`
    if (!e) problems.push(`${INDEX}:「${r.name}」在 ${tag} 是 root 出口,現在${what},${REGISTRY} 的 releases["${tag}"] 沒有寫 —— 寫明理由(發布說明「破壞性變更」的來源),或把出口加回來`)
    else if (e.kind && e.kind !== r.kind) problems.push(`${REGISTRY}:「${r.name}」kind 寫 ${e.kind},實際拿掉的是 ${r.kind === 'value' ? 'value(執行期)' : 'type(只有型別)'}`)
  }
  for (const [name] of byName) if (!removedNames.has(name)) problems.push(`${REGISTRY} releases["${tag}"]:「${name}」登記成拿掉,但它在 ${tag} 不是出口、或現在仍是同一種出口 —— 過期登記,刪掉`)
  if (notesText !== null) {
    const missing = namesMissingFromNotes(entries, notesText)
    if (missing.length) problems.push(`發布說明(--notes)沒寫 ${missing.length} 個 ${tag} 之後拿掉的出口:${missing.join('、')} —— 下一版的發布說明「破壞性變更 → root 出口」要逐一寫明(理由見 ${REGISTRY})`)
  }
  return { problems, removed, added }
}

export function lastReleaseTag(root) {
  const r = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

/** 上一次發布那一版的 src 取到暫存資料夾(git archive,只取 DS src) */
function releasedTree(root, tag) {
  const dir = mkdtempSync(join(tmpdir(), 'root-exports-'))
  const a = spawnSync('sh', ['-c', `git archive --format=tar "$0" packages/design-system/src | tar -x -C "$1"`, tag, dir], { cwd: root, encoding: 'utf8' })
  if (a.status !== 0) { rmSync(dir, { recursive: true, force: true }); throw new InstrumentError(`git archive ${tag} 失敗:${String(a.stderr).trim().slice(0, 160)}`) }
  return dir
}

function readRegistry(root) {
  const p = join(root, REGISTRY)
  if (!existsSync(p)) return { releases: {} }
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { throw new InstrumentError(`${REGISTRY} 不是合法 JSON:${e.message}`) }
}

export function check(root = ROOT, tagArg = null, notesText = null) {
  const tag = tagArg ?? lastReleaseTag(root)
  if (!tag) throw new InstrumentError('找不到上一次發布的 tag(v*)—— CI 要 fetch-depth: 0 帶 tag;沒比到不是通過')
  const dir = releasedTree(root, tag)
  try {
    const released = rootExports(join(dir, INDEX))
    const current = rootExports(join(root, INDEX))
    if (released.size === 0 || current.size === 0) throw new InstrumentError(`算出 0 個出口(${tag} ${released.size} / 現在 ${current.size})`)
    return { tag, ...compareExports(released, current, readRegistry(root), tag, notesText), releasedSize: released.size, currentSize: current.size }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// ── selftest:兩棵合成小樹真的跑 rootExports + compareExports ───────────────────────────
function selftest() {
  const fails = []
  const expect = (c, m) => { if (!c) fails.push(m) }
  const mk = (files) => {
    const d = mkdtempSync(join(tmpdir(), 'root-exports-st-'))
    for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), t) }
    return d
  }
  const before = mk({
    'index.ts': "export { useNarrow, SIDE_MIN } from './a'\nexport type { Expansion } from './a'\nexport * from './b'\nexport { Kept } from './a'\n",
    'a.ts': 'export function useNarrow() { return true }\nexport const SIDE_MIN = 640\nexport type Expansion = "single" | "multi"\nexport class Kept {}\n',
    'b.ts': 'export const fromStar = 1\nexport interface StarType { a: number }\n',
  })
  const after = mk({
    'index.ts': "export type { Kept } from './a'\nexport * from './b'\nexport { added } from './a'\n",
    'a.ts': 'export class Kept {}\nexport const added = 2\n',
    'b.ts': 'export interface StarType { a: number }\n',
  })
  try {
    const R = rootExports(join(before, 'index.ts'))
    const C = rootExports(join(after, 'index.ts'))
    expect(R.get('useNarrow') === 'value' && R.get('SIDE_MIN') === 'value' && R.get('Expansion') === 'type' && R.get('fromStar') === 'value' && R.get('StarType') === 'type' && R.get('Kept') === 'value', `量法:export { } / export type { } / export * 的值與型別都分得出來(實得 ${JSON.stringify([...R])})`)
    expect(C.get('Kept') === 'type', '量法:export type { 類別 } 對外只有型別')
    const T = 'v9.9.9'
    const none = compareExports(R, C, { releases: {} }, T)
    const names = none.removed.map((r) => r.name).sort().join()
    expect(names === 'Expansion,Kept,SIDE_MIN,fromStar,useNarrow' && none.problems.length === 5, `紅:拿掉沒寫明 5 筆(含執行期降成型別的 Kept),實得 ${names} / ${none.problems.length}`)
    expect(none.added.join() === 'added', '新增的只列出、不擋')
    const full = { releases: { [T]: [
      { name: 'useNarrow', kind: 'value', reason: '桌機為主,不再提供窄螢幕判斷' }, { name: 'SIDE_MIN', kind: 'value', reason: '改由容器量' },
      { name: 'Expansion', kind: 'type', reason: '隨 expansion prop 一起拿掉' }, { name: 'fromStar', kind: 'value', reason: '內部用' }, { name: 'Kept', kind: 'value', reason: '只留型別' },
    ] } }
    expect(compareExports(R, C, full, T).problems.length === 0, `綠:全部寫明,實得 ${JSON.stringify(compareExports(R, C, full, T).problems)}`)
    const stale = structuredClone(full); stale.releases[T].push({ name: 'StarType', kind: 'type', reason: 'x' })
    expect(compareExports(R, C, stale, T).problems.some((p) => p.includes('過期登記')), '紅:登記了卻沒拿掉 = 過期登記')
    const wrongKind = structuredClone(full); wrongKind.releases[T][2].kind = 'value'
    expect(compareExports(R, C, wrongKind, T).problems.some((p) => p.includes('kind 寫 value')), '紅:種類寫錯')
    const noReason = structuredClone(full); noReason.releases[T][0].reason = ' '
    expect(compareExports(R, C, noReason, T).problems.some((p) => p.includes('理由空白')), '紅:理由空白')
    const oldTag = structuredClone(full); oldTag.releases['v9.9.8'] = [{ name: 'gone', kind: 'value', reason: '舊版拿掉' }, { name: 'alsoGone', kind: 'type', reason: '舊版拿掉' }]
    const staleNoNotes = compareExports(R, C, oldTag, T).problems.filter((p) => p.includes('releases["v9.9.8"]'))
    expect(staleNoNotes.length === 1 && staleNoNotes[0].includes('先證明') && !staleNoNotes[0].includes('刪掉這一段'), `紅:清單還留著更早的 tag,沒驗發布說明 → 只叫你先驗、不說已發出去,實得 ${JSON.stringify(staleNoNotes)}`)
    const notesAll = '## 破壞性變更\n- root 出口拿掉 `useNarrow`、`SIDE_MIN`、`Expansion`、`fromStar`、`Kept`(只剩型別);舊版 gone / alsoGone 已在上一版寫過'
    const staleVerified = compareExports(R, C, oldTag, T, notesAll).problems.filter((p) => p.includes('releases["v9.9.8"]'))
    expect(staleVerified.length === 1 && staleVerified[0].includes('已確認') && staleVerified[0].includes('刪掉這一段'), `紅:更早的 tag 那段 —— 發布說明驗過全部收錄才說「刪掉」,實得 ${JSON.stringify(staleVerified)}`)
    const staleMissing = compareExports(R, C, oldTag, T, notesAll.replace(' / alsoGone', '')).problems.filter((p) => p.includes('releases["v9.9.8"]'))
    expect(staleMissing.length === 1 && staleMissing[0].includes('沒寫 1 個') && staleMissing[0].includes('alsoGone'), `紅:更早的 tag 那段 —— 發布說明漏寫的名字被點名,實得 ${JSON.stringify(staleMissing)}`)
    const draftMissing = compareExports(R, C, full, T, notesAll.replace('`fromStar`、', '').replace('SIDE_MIN', 'SIDE_MINIMUM')).problems
    expect(draftMissing.length === 1 && draftMissing[0].includes('fromStar') && draftMissing[0].includes('SIDE_MIN') && !draftMissing[0].includes('useNarrow'), `紅:這一版的發布說明草稿漏寫 → 點名(整個識別字比對:SIDE_MINIMUM 不算 SIDE_MIN),實得 ${JSON.stringify(draftMissing)}`)
    expect(compareExports(R, C, full, T, notesAll).problems.length === 0, '綠:發布說明草稿全部寫了')
    let emptyNotes = false
    try { compareExports(R, C, full, T, '  \n') } catch (e) { emptyNotes = e instanceof InstrumentError }
    expect(emptyNotes, '儀器失效:--notes 給了空白說明不得當成通過')
  } finally { rmSync(before, { recursive: true, force: true }); rmSync(after, { recursive: true, force: true }) }
  return fails
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) {
    const fails = selftest()
    if (fails.length) { console.error(`✗ root-exports selftest:\n  ${fails.join('\n  ')}`); process.exit(1) }
    console.log('✓ root-exports selftest:量法分得出值 / 型別 / export * / export type 類別;四種紅各一面、登記齊全綠、新增不擋;發布說明漏寫 / 收錄 / 沒驗 / 空白各一面')
    return
  }
  const tagArg = args.find((a) => a.startsWith('--tag='))?.slice('--tag='.length) ?? null
  const notesArg = args.find((a) => a.startsWith('--notes='))?.slice('--notes='.length) ?? null
  try {
    let notesText = null
    if (notesArg !== null) {
      if (!existsSync(resolve(notesArg))) throw new InstrumentError(`--notes 指的檔案不存在:${notesArg}`)
      notesText = readFileSync(resolve(notesArg), 'utf8')
    }
    const r = check(ROOT, tagArg, notesText)
    for (const p of r.problems) console.error(`✗ ${p}`)
    if (r.problems.length) { console.error(`\n✗ root-exports:${r.problems.length} 筆(對 ${r.tag};${r.releasedSize} → ${r.currentSize} 個出口)`); process.exit(1) }
    console.log(`✓ root-exports:對 ${r.tag} 的 root 出口 ${r.releasedSize} → ${r.currentSize} 個;拿掉的 ${r.removed.length} 個全部在 ${REGISTRY} 寫明${notesText !== null ? `,也都寫進 --notes 那份發布說明` : ''}${r.added.length ? `;新增 ${r.added.length} 個(${r.added.slice(0, 8).join('、')}${r.added.length > 8 ? '…' : ''})` : ''}`)
  } catch (e) {
    if (e instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL root-exports:${e.message}`); process.exit(2) }
    throw e
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
