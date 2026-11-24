#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 跟「上一個發布 tag」比,下面「量得到的範圍」裡每一個破壞性差異都寫在變更帳本 `packages/design-system/ds-changes.json`
 *         「下一版」那一節,而且帳本寫的每一條機器看得到的變更都真的發生了。消費端(通常是 AI)讀帳本時,「沒寫 = 沒有破壞性改動」
 *         只對量得到的範圍成立;範圍外的(見下方「已知限制」)要靠作者寫 change = behavior / rule 條目。
 *         量得到的範圍(scripts/lib/public-surface.mjs,TypeScript checker,解析後的介面全文比對):
 *         (a) package.json exports 的每個子路徑(含 ./tokens/*、./hooks/*、./styles/*、./tools/*)與每個子路徑的出口(拿掉、從執行期降成只剩型別);
 *         (b) 每個出口展開後的完整介面:props / 型別攤平到含繼承來的成員(extends、Omit、Pick、交集、二擇一聯集都算),
 *             每個成員印成正規化型別文字(別名展開、聯集排序、DS 物件印成 {DS} 由它自己的住處另外量、外部具名型別印名字);
 *             函式出口比參數列與回傳;非物件的型別出口比展開後的全文;`declare module` 擴充(DataTable 的 ColumnMeta)。
 *             差異 = 成員消失、選填變必填、既有出口新增必填成員(消費端給值的一方)、型別文字任何改變;
 *             元件參數只多收值(舊的聯集每一支都還在)跟新的選填成員一樣算純新增;出口常數(無型別註記的資料)只比形狀不比內容;
 *         (c) 出貨 CSS 宣告的自訂屬性(拿掉),與舊版宣告過它的每個情境裡「實際生效的值」(var() 解開;情境自己沒宣告就繼承
 *             base = :root / @theme / html)—— 改值、或只拿掉某個情境的覆寫(dark 刪掉、:root 還在 → 那個情境改吃 base 的值)都算;
 *             情境以單一選擇器為單位(選擇器清單逐個拆開,`:not(…)` 讓位限定不算情境的一部分,所以拆成兩條或合成一條不算改);
 *             (d) DS 自訂的 @utility(拿掉);
 *         (e) 預設值:cva defaultVariants、出口元件參數解構的預設、本體裡對解構參數寫的 `x ?? 字面值` / `x ?? t(…, 字面值)`
 *             (含經本體 const 轉一手的)、components / patterns 裡以具名常數表達的預設(名字帶 DEFAULT 或被當後備值);改值或拿掉都算。
 *         規格散文不比(每版 47–96 份 spec 有改,逐份歸類會變蓋章)。
 *   已知限制(量不到,作者必須自己寫 behavior / rule 條目):執行期行為與語意(同一個值意思變了);依賴型別升級造成的透傳縮窄
 *         (新舊兩邊都從同一份 node_modules 解析 Radix / TanStack / React 型別);DS 物件型別只換了另一個 DS 物件(兩邊都印 {DS},
 *         成員差異仍在各自的住處報);二擇一聯集收窄成更嚴的組合(成員依名字合併);後備值經 hook / 函式間接決定
 *         (例 Dialog 寬由 `tierPx ?? DIALOG_WIDTH_TIERS.md` 算);@custom-variant、CSS 選擇器與 keyframes;出口常數的內容;
 *         CSS 的串接只模型化「情境自己 → base」一層(`[data-ui-size]` 這種只看屬性存在的情境不會被當成 `[data-ui-size="lg"]` 的上層,
 *         選擇器權重與宣告順序跨檔也不算),舊版沒宣告過的情境裡新長出的值不比。
 *   紅: 偵測到的差異在那一節沒有對應條目(漏寫,印出可貼上的條目骨架)/ removed、renamed、required、narrowed、default 條目
 *       對不到任何偵測到的差異(寫了卻沒發生)/ renamed 的 to 在新介面不存在 / 任何一節的 spec 不是工作樹的出貨檔或檔裡沒有那個段名
 *       (舊節的段名後來改了 → 在新節寫 errata 更正)/ fix.op 不是 rename-prop、rename-export、rename-token /
 *       帳本形狀錯(id 重複、欄位缺、do 不是一到三句)/ 上一個發布 tag 的帳本已有的節(≤ 那一版)跟現在不逐位元相同 /
 *       有比「下一版」更新的節 / 帳本沒有隨 npm 出貨(package.json files 與 exports "./ds-changes.json")/
 *       同名換義:登記已移除或改名的名字又出現在公開介面,卻沒有之後一節同 target 的 behavior 條目 → 指名並 exit 1。
 *       上一個發布 tag 還沒有帳本(引入帳本的那一版)時,帳本裡 ≤ 那一版的每一節改成逐段對 tag 驗(那一版 vs 它前一個發布 tag)。
 *   綠: 上面全部 0 筆。不是抽籤:純靜態量測(git archive + TypeScript 5.9.3 checker + 讀檔),沒有時序、取樣或網路,
 *       同一棵樹、同一個 tag 重跑結果逐字相同;型別文字由本檔自己正規化(不用 TS 的顯示字串),TS 印法改變不會讓結果翻面。
 *       對照組(--selftest):合成新舊兩棵樹,二十一類各破一處(含審查列的七種縮窄:物件型別間收窄、回呼參數、必填位置參數、
 *       回傳型別、CSS 改值、預設搬進本體、搬到 base interface 同時收窄,與既有型別新增必填成員、只刪 dark 覆寫)—— 每一處都必紅且只指名那一處、
 *       選擇器清單拆開 + `:not()` 值不變必 0 差異(拆開後真的改值仍只指名那一個)、
 *       登記齊全必綠;帳本的十種紅各一面;發版端說明(新增 / 行為與畫面變更 / 破壞性變更三段)少一行只指名那一條;真實資料:146→147 的 CalendarOwnProps.onCreateEvent、
 *       147→148 的 AppShellProps.mainMinWidth 與 FileUpload.buttonLabel、148→工作樹的 InputProps.height 與
 *       DataTableFilterPanelLabels.clearAll —— 拿掉帳本那一條就只指名它。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 找不到上一個發布 tag(CI 要 fetch-depth: 0 帶 tag)、git archive 失敗、
 *       任一邊量到 0 個子路徑或 0 個出口、讀不到帳本或不是合法 JSON、版本號不是 semver —— 不讀成通過。
 *
 * 取代(2026-11-16):root-exports-invariant.mjs(只量 root 出口)與 compat-policy-invariant.mjs 的 NC3 / NC4(只量 *Props / *Labels
 * 的成員),兩份登記清單 scripts/root-exports-removals.json、scripts/breaking-changes.json 併進帳本。需求原文(user 2026-11-15):
 * 「主要其實也是讓要更新的消費者，通常會是 AI ，可以很清楚明確知道新版增刪改了什麼可以避免breaking change ，也可以更有效率更準確地直接符合新的ds的規範和原則」。
 *
 * 用法:
 *   node scripts/public-surface-invariant.mjs                       上一個發布 tag → 工作樹,對帳本「下一版」那一節
 *   node scripts/public-surface-invariant.mjs --base=<tag> --head=<tag>   兩個 tag 之間,對帳本 <head 版號> 那一節(回填 / 證據)
 *   node scripts/public-surface-invariant.mjs --skeleton           只印未登記差異的條目骨架(JSON)
 *   node scripts/public-surface-invariant.mjs --selftest
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffSurfaces, measureSurface, SurfaceInstrumentError, surfaceHas } from './lib/public-surface.mjs'
import {
  compareVersions, entriesBetween, LEDGER_DETECTED_CHANGES, LEDGER_REPO_PATH, LedgerError, ledgerSections, ledgerShapeProblems, parseSpecRef,
} from '../packages/design-system/tools/changes/ledger.mjs'
import { releaseCreateArgs, releaseLedgerNotes, releaseNotesMissing } from './release-github-release.mjs'

const PS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PS_PKG = 'packages/design-system'
const PS_LEDGER_EXPORT = './ds-changes.json'

// ── 帳本 ↔ 差異 ─────────────────────────────────────────────────────────────────
const family = (surface) => (surface === 'prop' || surface === 'type' ? 'member' : surface)
/** 差異的 change → 帳本可接受的 change */
const ACCEPTS = Object.freeze({ removed: ['removed', 'renamed'], required: ['required'], narrowed: ['narrowed'], default: ['default'] })

const slug = (target) => target.replace(/^\.\//, 'subpath:').replace(/[^A-Za-z0-9._:-]+/g, '-')
export function skeletonOf(diff, version) {
  return {
    id: `${version}/${slug(diff.target)}`, surface: diff.surface, target: diff.target, change: diff.change,
    do: `<一到三句,與 spec 一致;機器偵測:${diff.detail}>`, spec: '<出貨檔路徑「段名」>',
  }
}

/** npm `files` 的最小比對(** / * / {a,b} / 開頭 ! 排除;目錄名涵蓋整個目錄) */
function filesMatcher(patterns) {
  const esc = (s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')
  const toRe = (g) => {
    let re = ''
    for (let i = 0; i < g.length; i += 1) {
      const c = g[i]
      if (c === '*' && g[i + 1] === '*') { re += '.*'; i += 1; if (g[i + 1] === '/') i += 1 } else if (c === '*') re += '[^/]*'
      else if (c === '{') { const j = g.indexOf('}', i); re += `(?:${g.slice(i + 1, j).split(',').map(esc).join('|')})`; i = j } else re += esc(c)
    }
    return new RegExp(`^${re}(?:/.*)?$`)
  }
  const pos = patterns.filter((p) => !p.startsWith('!')).map(toRe)
  const neg = patterns.filter((p) => p.startsWith('!')).map((p) => toRe(p.slice(1)))
  return (rel) => ['package.json', 'README.md'].includes(rel) || (pos.some((r) => r.test(rel)) && !neg.some((r) => r.test(rel)))
}

/** spec 欄的檢查:路徑在出貨檔裡、檔案存在、檔裡有那個段名。pkgDir = 那一版的 packages/design-system */
export function specProblem(spec, pkgDir) {
  const ref = parseSpecRef(spec)
  if (!ref) return `spec「${spec}」要寫成「出貨檔路徑「段名」」`
  let pkg
  try { pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) } catch { return `讀不到 ${pkgDir}/package.json(判不出出貨檔)` }
  if (!filesMatcher(pkg.files ?? [])(ref.path)) return `spec 的「${ref.path}」不在 package.json files 裡 —— 不是出貨檔,消費端的 node_modules 讀不到`
  const abs = join(pkgDir, ref.path)
  if (!existsSync(abs)) return `spec 的「${ref.path}」不存在`
  if (!readFileSync(abs, 'utf8').includes(ref.section)) return `spec 的「${ref.path}」裡找不到段名「${ref.section}」`
  return null
}

/**
 * 純函式:一節的條目 ↔ 偵測到的差異。
 * diffs = diffSurfaces();head = 新快照(查 renamed 的 to);pkgDir = 新樹的 packages/design-system(查 spec)。
 */
export function checkSection({ diffs, head, ledger, version, pkgDir }) {
  const problems = []
  const section = ledger?.releases?.[version] ?? { changes: [] }
  const entries = Array.isArray(section.changes) ? section.changes : []
  const at = `${LEDGER_REPO_PATH} releases["${version}"]`
  // 改名條目也說明了「新名字是新的必填成員」那一筆(同一件事的兩面:舊名消失 + 新名必填)
  const matches = (e, d) => family(e.surface) === family(d.surface) && (
    (e.target === d.target && (ACCEPTS[d.change] ?? []).includes(e.change))
    || (d.change === 'required' && e.change === 'renamed' && e.to === d.target))
  for (const d of diffs) {
    if (entries.some((e) => matches(e, d))) continue
    problems.push(`漏寫:${d.surface} ${d.target}(${d.change}:${d.detail})—— ${at} 沒有對應條目。骨架:${JSON.stringify(skeletonOf(d, version))}`)
  }
  for (const e of entries) {
    const where = `${at} ${e.id ?? '(沒有 id)'}`
    if (LEDGER_DETECTED_CHANGES.includes(e.change) && !diffs.some((d) => matches(e, d))) {
      problems.push(`寫了卻沒發生:${where}(${e.surface} ${e.target} ${e.change})—— 比對閘在這一版沒有偵測到這個差異;target 寫錯、這一版其實沒改、或它是行為 / 規則變更(change 改寫 behavior / rule)`)
    }
    if (e.change === 'renamed' && typeof e.to === 'string' && !surfaceHas(head, family(e.surface) === 'member' ? 'prop' : e.surface, e.to)) {
      problems.push(`改名的 to 不存在:${where} 的 to「${e.to}」在這一版的公開介面找不到(${e.surface} 同一套鍵)`)
    }
    if (typeof e.spec === 'string') {
      const p = specProblem(e.spec, pkgDir)
      if (p) problems.push(`${where}:${p}`)
    }
  }
  return problems
}

/**
 * 每一節(套完勘誤)的 spec 都要指得到工作樹的出貨檔與段名 —— 升版指令與報告一律指向消費端裝的那一版套件裡的規格;
 * 舊節的段名後來改了,要在新節寫 errata(supersedes 舊 id、給新的 spec),不能讓消費端照舊指標找不到。
 */
export function allSpecProblems(ledger, version, pkgDir) {
  const problems = []
  for (const { version: v, entry } of entriesBetween(ledger, { to: version })) {
    if (v === version || typeof entry.spec !== 'string') continue
    const p = specProblem(entry.spec, pkgDir)
    if (p) problems.push(`${LEDGER_REPO_PATH} releases["${v}"] ${entry.id}:${p}(舊節不改;在 releases["${version}"] 加 errata { supersedes: "${entry.id}", spec: "<新的段名>" })`)
  }
  return problems
}

/** 已發布節逐位元相同(errata 只能寫在新節,所以舊節永遠不動) */
export function frozenSectionProblems(ledger, baseLedger, baseVersion) {
  const problems = []
  const old = new Map(ledgerSections(baseLedger))
  const now = new Map(ledgerSections(ledger))
  for (const [v, s] of old) {
    if (compareVersions(v, baseVersion) > 0) continue
    if (!now.has(v)) problems.push(`已發布的節 releases["${v}"] 不見了 —— 帳本只加不刪`)
    else if (JSON.stringify(now.get(v)) !== JSON.stringify(s)) problems.push(`已發布的節 releases["${v}"] 跟 v${baseVersion} 的帳本不逐位元相同 —— 已發布的節不改,更正寫在新節的 errata(supersedes 舊 id)`)
  }
  for (const [v] of now) {
    if (compareVersions(v, baseVersion) <= 0 && !old.has(v)) problems.push(`releases["${v}"] 比上一個發布 v${baseVersion} 舊,但 v${baseVersion} 的帳本沒有這一節 —— 帳本出貨後不能補登舊節`)
  }
  return problems
}

/**
 * 同名換義:帳本登記「已移除 / 改名」的名字現在又出現在公開介面 → 一定要有更新一節、同一個 target 的 behavior 條目說明新意思。
 * 消費端寫入檢查的名單(removedNamesProjection)靠這一條判斷「目前不存在」;to = target(名字照用、由別處提供)除外。
 */
export function reintroducedProblems(ledger, head) {
  const latest = ledgerSections(ledger).at(-1)?.[0]
  if (!latest) return []
  const all = entriesBetween(ledger, { to: latest })
  const problems = []
  for (const { version, entry } of all) {
    if (!['removed', 'renamed'].includes(entry.change) || entry.to === entry.target) continue
    if (!surfaceHas(head, family(entry.surface) === 'member' ? 'prop' : entry.surface, entry.target)) continue
    const explained = all.some((x) => x.entry.change === 'behavior' && x.entry.target === entry.target && compareVersions(x.version, version) > 0)
    if (!explained) problems.push(`同名換義:${entry.id} 登記 ${entry.target} 已${entry.change === 'renamed' ? '改名' : '移除'},但它現在又在公開介面裡 —— 在之後的節寫一條 change = behavior、target 相同的條目說明新意思(消費端寫入檢查才會放行這個名字)`)
  }
  return problems
}

/** 下一版的節是哪一個:package.json 已經 bump → 就是它;還沒 bump → 帳本裡唯一一個比上一個發布新的節(沒有就用 bump 一號的版本) */
export function resolveCurrentVersion({ ledger, baseVersion, pkgVersion }) {
  const problems = []
  const cmp = compareVersions(pkgVersion, baseVersion)
  if (cmp < 0) throw new LedgerError(`package.json 的版本 ${pkgVersion} 比上一個發布 v${baseVersion} 還舊`)
  const newer = ledgerSections(ledger).map(([v]) => v).filter((v) => compareVersions(v, baseVersion) > 0)
  let version
  if (cmp > 0) {
    version = pkgVersion
    for (const v of newer) if (v !== pkgVersion) problems.push(`releases["${v}"] 不是下一版:package.json 已經是 ${pkgVersion},這一版的變更要寫在 releases["${pkgVersion}"]`)
  } else if (newer.length > 1) {
    version = newer[0]
    problems.push(`帳本有 ${newer.length} 個比 v${baseVersion} 新的節(${newer.join('、')})—— 下一版只有一節`)
  } else {
    version = newer[0] ?? bumpPrerelease(baseVersion)
  }
  return { version, problems }
}
function bumpPrerelease(v) {
  const m = /^(.*-[A-Za-z-]+\.)(\d+)$/.exec(v)
  if (m) return `${m[1]}${Number(m[2]) + 1}`
  const [a, b, c] = v.split('.').map(Number)
  return `${a}.${b}.${c + 1}`
}

// ── git ─────────────────────────────────────────────────────────────────────────
const git = (args) => spawnSync('git', args, { cwd: PS_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
export function lastReleaseTag(ref = 'HEAD') {
  const r = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', ref])
  return r.status === 0 ? r.stdout.trim() || null : null
}
export function archiveTree(tag) {
  const dir = mkdtempSync(join(tmpdir(), 'public-surface-'))
  // 整個套件資料夾(src 量介面;ds-canonical / README 等出貨檔給 spec 欄查「是不是出貨檔、有沒有那個段名」)
  const a = spawnSync('sh', ['-c', 'git archive --format=tar "$0" "$1" | tar -x -C "$DEST"', tag, PS_PKG], { cwd: PS_ROOT, encoding: 'utf8', env: { ...process.env, DEST: dir } })
  if (a.status !== 0 || !existsSync(join(dir, PS_PKG, 'src'))) { rmSync(dir, { recursive: true, force: true }); throw new SurfaceInstrumentError(`git archive ${tag} 失敗:${String(a.stderr).trim().slice(0, 160)}`) }
  return dir
}
function ledgerAt(tag) {
  const r = git(['show', `${tag}:${LEDGER_REPO_PATH}`])
  if (r.status === 0) {
    try { return JSON.parse(r.stdout) } catch (e) { throw new SurfaceInstrumentError(`${tag} 的 ${LEDGER_REPO_PATH} 不是合法 JSON:${e.message}`) }
  }
  if (/does not exist in|exists on disk, but not in/.test(r.stderr)) return null
  throw new SurfaceInstrumentError(`讀不到 ${tag}:${LEDGER_REPO_PATH}:${r.stderr.trim().slice(0, 160)}`)
}
function readJson(abs, label) {
  if (!existsSync(abs)) throw new SurfaceInstrumentError(`${label} 不存在`)
  try { return JSON.parse(readFileSync(abs, 'utf8')) } catch (e) { throw new SurfaceInstrumentError(`${label} 不是合法 JSON:${e.message}`) }
}

/** 量一棵樹(tag 或工作樹)。cache 讓同一次執行裡同一個 tag 只量一次。 */
function makeMeasurer() {
  const cache = new Map()
  const dirs = []
  const measure = (ref) => {
    if (cache.has(ref)) return cache.get(ref)
    const treeRoot = ref === null ? PS_ROOT : archiveTree(ref)
    if (ref !== null) dirs.push(treeRoot)
    const snap = measureSurface(treeRoot, PS_ROOT)
    const moduleExports = [...snap.subpaths.values()].reduce((n, s) => n + (s.exports ?? 0), 0)
    if (!snap.subpaths.size || !moduleExports) throw new SurfaceInstrumentError(`${ref ?? '工作樹'} 量到 ${snap.subpaths.size} 個子路徑、${moduleExports} 個出口`)
    const out = { snap, pkgDir: join(treeRoot, PS_PKG) }
    cache.set(ref, out)
    return out
  }
  return { measure, cleanup: () => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })) }
}

/** 兩個 tag 之間(回填 / 證據):對工作樹帳本 <head 版號> 那一節 */
export function checkRange({ base, head, ledger, measurer }) {
  const b = measurer.measure(base)
  const h = measurer.measure(head)
  const diffs = diffSurfaces(b.snap, h.snap)
  const version = head.replace(/^v/, '')
  return { diffs, version, problems: checkSection({ diffs, head: h.snap, ledger, version, pkgDir: h.pkgDir }) }
}

export function check({ base = null } = {}) {
  const tag = base ?? lastReleaseTag()
  if (!tag) throw new SurfaceInstrumentError('找不到上一個發布的 tag(v*)—— CI 要 fetch-depth: 0 帶 tag;沒比到不是通過')
  const baseVersion = tag.replace(/^v/, '')
  const ledger = readJson(join(PS_ROOT, LEDGER_REPO_PATH), LEDGER_REPO_PATH)
  const pkg = readJson(join(PS_ROOT, PS_PKG, 'package.json'), `${PS_PKG}/package.json`)
  const problems = ledgerShapeProblems(ledger).map((p) => `帳本形狀:${p}`)
  if (!(pkg.files ?? []).includes('ds-changes.json')) problems.push(`${PS_PKG}/package.json 的 files 沒有 "ds-changes.json" —— 帳本沒隨 npm 出貨,消費端讀不到`)
  if (pkg.exports?.[PS_LEDGER_EXPORT] !== PS_LEDGER_EXPORT) problems.push(`${PS_PKG}/package.json 的 exports 沒有 "${PS_LEDGER_EXPORT}": "${PS_LEDGER_EXPORT}"`)
  if (problems.some((p) => p.startsWith('帳本形狀:releases'))) return { tag, problems, diffs: [] }
  const { version, problems: versionProblems } = resolveCurrentVersion({ ledger, baseVersion, pkgVersion: pkg.version })
  problems.push(...versionProblems)
  for (const [v] of ledgerSections(ledger)) if (compareVersions(v, version) > 0) problems.push(`releases["${v}"] 比下一版 ${version} 還新 —— 還沒發生的變更不寫`)
  const measurer = makeMeasurer()
  try {
    const b = measurer.measure(tag)
    const h = measurer.measure(null)
    const diffs = diffSurfaces(b.snap, h.snap)
    problems.push(...checkSection({ diffs, head: h.snap, ledger, version, pkgDir: h.pkgDir }))
    problems.push(...reintroducedProblems(ledger, h.snap))
    problems.push(...allSpecProblems(ledger, version, h.pkgDir))
    const baseLedger = ledgerAt(tag)
    const bootstrap = []
    if (baseLedger) problems.push(...frozenSectionProblems(ledger, baseLedger, baseVersion))
    else {
      // 引入帳本的那一版:≤ 上一個發布的節是回填的,沒有舊帳本可比 —— 逐段對 tag 驗(那一版 vs 它前一個發布)
      for (const [v] of ledgerSections(ledger)) {
        if (compareVersions(v, baseVersion) > 0) continue
        const headTag = `v${v}`
        const prev = lastReleaseTag(`${headTag}^`)
        if (!prev) { problems.push(`回填的 releases["${v}"]:找不到 ${headTag} 或它前一個發布 tag —— 沒驗到不是通過`); continue }
        const r = checkRange({ base: prev, head: headTag, ledger, measurer })
        bootstrap.push(`${prev}→${headTag} ${r.diffs.length} 個差異`)
        problems.push(...r.problems.map((p) => `回填 ${prev}→${headTag}:${p}`))
      }
    }
    return { tag, version, problems, diffs, bootstrap, baseSize: b.snap.exports.size, headSize: h.snap.exports.size }
  } finally { measurer.cleanup() }
}

// ── selftest ─────────────────────────────────────────────────────────────────────
const ST_PKG = { name: 'st', version: '9.9.9', files: ['src/**/*.{ts,tsx,css}', 'src/**/*.spec.md', 'ds-changes.json'], exports: {
  '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  './components/*': { types: './dist/components/*/index.d.ts', import: './dist/components/*/index.js' },
  './hooks/*': { types: './dist/hooks/*.d.ts', import: './dist/hooks/*.js' },
  './styles/base': './src/styles/base.css',
  './ds-changes.json': './ds-changes.json',
} }
const ST_BUTTON = `function cva(base: string, config: unknown) { return (_?: unknown) => base + String(config) }
export const buttonVariants = cva('btn', { variants: { size: { sm: 'a', md: 'b' } }, defaultVariants: { size: 'md' } })
const BUTTON_TONE_FALLBACK = 'neutral'
export interface ButtonLabels { close?: string }
export type ButtonSel = { mode: 'include'; ids: string[] }
export interface ButtonProps { size?: 'sm' | 'md' | 'lg'; tone?: string; label?: string; legacy?: boolean; labels?: ButtonLabels; selection?: string[] | ButtonSel; onPick?: (value: string) => void }
export function Button({ size = 'md', tone }: ButtonProps) { return (tone ?? BUTTON_TONE_FALLBACK) + size }
export function Extra() { return 1 }
`
const ST_TABLE = `import type { RowData } from '@tanstack/react-table'
export type TableRow = RowData
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> { stWidth?: number; stAlign?: 'start' | 'end' }
}
`
const ST_FILES = {
  'package.json': JSON.stringify(ST_PKG),
  'src/index.ts': "export * from './components/Button'\nexport * from './components/Table'\nexport { useThing } from './hooks/use-thing'\nexport { useFlag, useMode } from './lib/flag'\n",
  'src/lib/flag.ts': 'export function useFlag(): boolean { return true }\nexport function useMode(): string { return \'a\' }\n',
  'src/components/Button/index.ts': "export { Button, Extra, buttonVariants } from './button'\nexport type { ButtonProps, ButtonLabels, ButtonSel } from './button'\n",
  'src/components/Button/button.tsx': ST_BUTTON,
  'src/components/Button/button.spec.md': '# Button\n\n## 尺寸\n\nsm / md\n',
  'src/components/Table/index.ts': "export type { TableRow } from './table'\n",
  'src/components/Table/table.ts': ST_TABLE,
  'src/hooks/use-thing.ts': 'export function useThing(): { open: boolean; toggle: () => void } { return { open: true, toggle: () => {} } }\n',
  'src/styles/base.css': ':root {\n  --ds-gap: 4px;\n  --ds-old: 1px;\n  --ds-fg: #111;\n  --ds-row: 2.5rem;\n}\n[data-theme="dark"] {\n  --ds-fg: #eee;\n}\n[data-ui-size="lg"], [data-density="lg"] {\n  --ds-row: 3rem;\n}\n@utility text-old {\n  font-size: 1px;\n}\n',
}
/** 十一類各破一處:[名稱, 改法, 期望的 surface, 期望的 target, 期望的 change] */
const ST_BREAKS = [
  ['子路徑', (f) => { const p = JSON.parse(f['package.json']); delete p.exports['./hooks/*']; f['package.json'] = JSON.stringify(p) }, 'subpath', './hooks/use-thing', 'removed'],
  ['出口', (f) => { f['src/components/Button/index.ts'] = f['src/components/Button/index.ts'].replace('Extra, ', '') }, 'export', 'Extra', 'removed'],
  ['成員消失', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace(' legacy?: boolean;', '') }, 'prop', 'ButtonProps.legacy', 'removed'],
  ['選填變必填', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace('label?: string', 'label: string') }, 'prop', 'ButtonProps.label', 'required'],
  ['字面值變少', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace(" | 'lg'", '') }, 'prop', 'ButtonProps.size', 'narrowed'],
  ['巢狀型別成員', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace('close?: string', 'dismiss?: string') }, 'prop', 'ButtonLabels.close', 'removed'],
  ['declare module 擴充', (f) => { f['src/components/Table/table.ts'] = f['src/components/Table/table.ts'].replace(' stWidth?: number;', '') }, 'type', 'ColumnMeta.stWidth', 'removed'],
  ['CSS 自訂屬性', (f) => { f['src/styles/base.css'] = f['src/styles/base.css'].replace('  --ds-old: 1px;\n', '') }, 'token', '--ds-old', 'removed'],
  ['@utility', (f) => { f['src/styles/base.css'] = f['src/styles/base.css'].replace(/@utility text-old \{[^}]*\}\n/, '') }, 'class', 'text-old', 'removed'],
  ['cva 預設', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace("defaultVariants: { size: 'md' }", "defaultVariants: { size: 'sm' }") }, 'default', 'buttonVariants.size', 'default'],
  ['具名常數預設', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace("BUTTON_TONE_FALLBACK = 'neutral'", "BUTTON_TONE_FALLBACK = 'brand'") }, 'default', 'BUTTON_TONE_FALLBACK', 'default'],
  ['參數解構預設', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace("{ size = 'md', tone }", "{ size = 'sm', tone }") }, 'default', 'Button.size', 'default'],
  // 審查(2026-11-16)列的七種縮窄 + 既有型別新增必填成員
  ['預設搬進本體 ?? 且改值', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace("export function Button({ size = 'md', tone }: ButtonProps) { return (tone ?? BUTTON_TONE_FALLBACK) + size }", "export function Button({ size, tone }: ButtonProps) { return (tone ?? BUTTON_TONE_FALLBACK) + (size ?? 'lg') }") }, 'default', 'Button.size', 'default'],
  ['物件型別間收窄', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace('selection?: string[] | ButtonSel', 'selection?: ButtonSel') }, 'prop', 'ButtonProps.selection', 'narrowed'],
  ['回呼參數型別', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace('(value: string) => void', '(value: number) => void') }, 'prop', 'ButtonProps.onPick', 'narrowed'],
  ['出口函式新增必填位置參數', (f) => { f['src/lib/flag.ts'] = f['src/lib/flag.ts'].replace('useFlag(): boolean { return true }', 'useFlag(id: string): boolean { return Boolean(id) }') }, 'export', 'useFlag', 'narrowed'],
  ['出口函式回傳型別', (f) => { f['src/lib/flag.ts'] = f['src/lib/flag.ts'].replace("useMode(): string { return 'a' }", 'useMode(): number { return 1 }') }, 'export', 'useMode', 'narrowed'],
  ['CSS 自訂屬性改值', (f) => { f['src/styles/base.css'] = f['src/styles/base.css'].replace('--ds-gap: 4px;', '--ds-gap: 2px;') }, 'token', '--ds-gap', 'default'],
  ['搬到 base interface 同時收窄', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace("export interface ButtonProps { size?: 'sm' | 'md' | 'lg'; tone?: string;", "interface ButtonSizeProps { size?: 'sm' | 'md' }\nexport interface ButtonProps extends ButtonSizeProps { tone?: string;") }, 'prop', 'ButtonProps.size', 'narrowed'],
  ['只刪掉某個情境的覆寫(dark 拿掉,:root 還在)', (f) => { f['src/styles/base.css'] = f['src/styles/base.css'].replace('[data-theme="dark"] {\n  --ds-fg: #eee;\n}\n', '') }, 'token', '--ds-fg', 'default'],
  ['既有型別新增必填成員', (f) => { f['src/components/Button/button.tsx'] = f['src/components/Button/button.tsx'].replace('legacy?: boolean;', 'legacy?: boolean; count: number;') }, 'prop', 'ButtonProps.count', 'required'],
]

function selftest() {
  const fails = []
  const expect = (c, m) => { if (!c) fails.push(m) }
  const dirs = []
  const mkTree = (files) => {
    const root = mkdtempSync(join(tmpdir(), 'public-surface-st-'))
    dirs.push(root)
    for (const [p, t] of Object.entries(files)) { const abs = join(root, PS_PKG, p); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, t) }
    return root
  }
  const V = '9.9.10'
  const entry = (d, o = {}) => ({ id: `${V}/${slug(d.target)}`, surface: d.surface, target: d.target, change: d.change, do: '照新規格改。', spec: 'src/components/Button/button.spec.md「尺寸」', ...o })
  try {
    const oldRoot = mkTree(ST_FILES)
    const before = measureSurface(oldRoot, PS_ROOT)
    expect(before.members.has('ColumnMeta.stWidth') && before.members.has('ButtonLabels.close') && before.defaults.has('BUTTON_TONE_FALLBACK') && before.defaults.has('Button.size') && before.defaults.has('buttonVariants.size'),
      `量法:擴充介面 / 巢狀型別 / 具名常數預設 / 解構預設 / cva 預設都量得到,實得 members ${[...before.members.keys()].join(',')} defaults ${[...before.defaults.keys()].join(',')}`)
    expect(diffSurfaces(before, measureSurface(mkTree(ST_FILES), PS_ROOT)).length === 0, '對照:同一棵樹量兩次 → 0 個差異(量具不會自己冒出差異)')
    {
      // 對照:同一組覆寫從一條選擇器清單拆成兩條、加上 :not() 讓位限定 —— 每個情境生效的值都沒變 → 0 個差異
      const same = structuredClone(ST_FILES)
      same['src/styles/base.css'] = same['src/styles/base.css'].replace('[data-ui-size="lg"], [data-density="lg"] {\n  --ds-row: 3rem;\n}\n', '[data-ui-size="lg"] {\n  --ds-row: 3rem;\n}\n[data-density="lg"]:not([data-ui-size]) {\n  --ds-row: 3rem;\n}\n')
      const d = diffSurfaces(before, measureSurface(mkTree(same), PS_ROOT))
      expect(d.length === 0, `對照:選擇器清單拆開 + :not() 限定、值不變 → 0 個差異,實得 ${JSON.stringify(d.map((x) => [x.target, x.detail]))}`)
      // 同一個寫法但值真的改了 → 必紅(拆開本身不吃掉改值)
      same['src/styles/base.css'] = same['src/styles/base.css'].replace('[data-density="lg"]:not([data-ui-size]) {\n  --ds-row: 3rem;', '[data-density="lg"]:not([data-ui-size]) {\n  --ds-row: 3.5rem;')
      const d2 = diffSurfaces(before, measureSurface(mkTree(same), PS_ROOT))
      expect(d2.length === 1 && d2[0].target === '--ds-row' && d2[0].change === 'default', `對照:拆開後其中一條改值 → 只指名 --ds-row,實得 ${JSON.stringify(d2.map((x) => [x.target, x.change]))}`)
    }
    for (const [label, mutate, surface, target, change] of ST_BREAKS) {
      const files = structuredClone(ST_FILES)
      mutate(files)
      const newRoot = mkTree(files)
      const after = measureSurface(newRoot, PS_ROOT)
      const diffs = diffSurfaces(before, after)
      const pkgDir = join(newRoot, PS_PKG)
      expect(diffs.length === 1 && diffs[0].surface === surface && diffs[0].target === target && diffs[0].change === change,
        `${label}:應只偵測到 ${surface} ${target} ${change},實得 ${JSON.stringify(diffs.map((d) => [d.surface, d.target, d.change]))}`)
      const red = checkSection({ diffs, head: after, ledger: { releases: {} }, version: V, pkgDir })
      expect(red.length === 1 && red[0].startsWith('漏寫') && red[0].includes(target), `${label}:沒登記 → 紅且只指名 ${target},實得 ${JSON.stringify(red)}`)
      const green = checkSection({ diffs, head: after, ledger: { releases: { [V]: { changes: diffs.map((d) => entry(d)) } } }, version: V, pkgDir })
      expect(green.length === 0, `${label}:登記齊全 → 綠,實得 ${JSON.stringify(green)}`)
    }
    // 帳本那一側的紅
    const files = structuredClone(ST_FILES)
    ST_BREAKS[2][1](files)
    files['src/components/Button/button.tsx'] = files['src/components/Button/button.tsx'].replace('tone?: string;', 'tone?: string; legacyNext?: boolean;')
    const newRoot = mkTree(files)
    const after = measureSurface(newRoot, PS_ROOT)
    const diffs = diffSurfaces(before, after)
    const pkgDir = join(newRoot, PS_PKG)
    const base = entry(diffs[0])
    const run = (changes) => checkSection({ diffs, head: after, ledger: { releases: { [V]: { changes } } }, version: V, pkgDir })
    const one = (label, changes, needle) => { const p = run(changes); expect(p.length === 1 && p[0].includes(needle), `${label}:應只有一筆含「${needle}」,實得 ${JSON.stringify(p)}`) }
    expect(run([base]).length === 0, '帳本綠:removed 對到偵測到的差異')
    expect(run([{ ...base, change: 'renamed', to: 'ButtonProps.legacyNext' }]).length === 0, '帳本綠:renamed 的 to 存在於新介面')
    one('寫了卻沒發生', [base, entry({ surface: 'prop', target: 'ButtonProps.tone', change: 'removed' }, { id: `${V}/tone` })], '寫了卻沒發生')
    one('改名的 to 不存在', [{ ...base, change: 'renamed', to: 'ButtonProps.nope' }], '改名的 to 不存在')
    one('spec 不是出貨檔', [{ ...base, spec: 'docs/button.md「尺寸」' }], '不是出貨檔')
    one('spec 段名不存在', [{ ...base, spec: 'src/components/Button/button.spec.md「顏色」' }], '找不到段名')
    expect(run([{ ...base, change: 'behavior' }, entry({ surface: 'behavior', target: 'Button.onClick', change: 'behavior' }, { id: `${V}/b` })]).filter((p) => p.startsWith('漏寫')).length === 1,
      '帳本紅:removed 寫成 behavior 不算登記(漏寫);behavior 條目本身不要求偵測到')
    const shape = (label, ledger, needle) => { const p = ledgerShapeProblems(ledger); expect(p.some((x) => x.includes(needle)), `形狀紅(${label}):應有「${needle}」,實得 ${JSON.stringify(p)}`) }
    shape('fix op', { releases: { [V]: { changes: [{ ...base, fix: { op: 'rewrite-everything', from: 'a', to: 'b' } }] } } }, '不在三種內')
    shape('id 重複', { releases: { [V]: { changes: [base, base] } } }, '重複')
    shape('renamed 沒 to', { releases: { [V]: { changes: [{ ...base, change: 'renamed' }] } } }, '一定要寫 to')
    shape('do 超過三句', { releases: { [V]: { changes: [{ ...base, do: '一。二。三。四。' }] } } }, '一到三句')
    shape('勘誤指錯', { releases: { [V]: { changes: [base], errata: [{ supersedes: `${V}/nope`, do: '改。' }] } } }, '不是更早一節')
    const older = { releases: { '9.9.9': { changes: [{ ...base, id: '9.9.9/x' }] } } }
    const withErrata = { releases: { ...older.releases, [V]: { changes: [], errata: [{ supersedes: '9.9.9/x', do: '更正後的做法。' }] } } }
    expect(ledgerShapeProblems(withErrata).length === 0 && frozenSectionProblems(withErrata, older, '9.9.9').length === 0, '勘誤綠:新節的 errata 更正舊條目,舊節逐位元不動')
    const edited = structuredClone(withErrata); edited.releases['9.9.9'].changes[0].do = '偷改舊節。'
    expect(frozenSectionProblems(edited, older, '9.9.9').some((p) => p.includes('不逐位元相同')), '紅:改了已發布的節')
    expect(frozenSectionProblems({ releases: {} }, older, '9.9.9').some((p) => p.includes('不見了')), '紅:已發布的節被刪')
    expect(resolveCurrentVersion({ ledger: { releases: { '9.9.10': { changes: [] }, '9.9.11': { changes: [] } } }, baseVersion: '9.9.9', pkgVersion: '9.9.9' }).problems.length === 1, '紅:還沒 bump 時有兩個比上一版新的節')
    expect(resolveCurrentVersion({ ledger: { releases: { '9.9.11': { changes: [] } } }, baseVersion: '9.9.9', pkgVersion: '9.9.10' }).problems.length === 1, '紅:bump 後節的鍵不是 package.json 的版本')
    expect(resolveCurrentVersion({ ledger: { releases: {} }, baseVersion: '0.1.0-beta.148', pkgVersion: '0.1.0-beta.148' }).version === '0.1.0-beta.149', '下一版:沒有節也沒 bump → 預發布號加一')
    const gone = { releases: { '9.9.9': { changes: [entry({ surface: 'export', target: 'Extra', change: 'removed' }, { id: '9.9.9/Extra' })] } } }
    const back = reintroducedProblems(gone, before)
    expect(back.length === 1 && back[0].includes('同名換義') && back[0].includes('Extra'), `紅:登記已移除的 Extra 又出現在公開介面、沒有 behavior 條目,實得 ${JSON.stringify(back)}`)
    const explained = structuredClone(gone); explained.releases[V] = { changes: [entry({ surface: 'behavior', target: 'Extra', change: 'behavior' }, { id: `${V}/Extra-again` })] }
    expect(reintroducedProblems(explained, before).length === 0, '綠:之後的節有同一個 target 的 behavior 條目(說明新意思)')
    const stillValid = structuredClone(gone); stillValid.releases['9.9.9'].changes[0].to = 'Extra'
    expect(reintroducedProblems(stillValid, before).length === 0, '綠:to = target(名字照用、由別處提供)')
  } catch (e) {
    fails.push(`${e instanceof SurfaceInstrumentError ? '儀器失效' : '例外'}:合成樹那一段跑不完 —— ${e.stack ?? e.message}`)
  } finally { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })) }

  // 發版端(scripts/release-github-release.mjs):GitHub Release 說明的「新增 / 行為與畫面變更 / 破壞性變更」三段由帳本那一節產生,
  // 讀回驗收逐條 id 與三個段名(依序)。新增 / 行為與畫面變更兩類的對照組(含合成帳本)在 release-notes-coverage-invariant.mjs --selftest。
  try {
    const ledgerText = readFileSync(join(PS_ROOT, LEDGER_REPO_PATH), 'utf8')
    const head = '0'.repeat(40)
    const fakeGit = (args) => (args[0] === 'show' && args[1] === `${head}:${LEDGER_REPO_PATH}` ? { status: 0, stdout: ledgerText, stderr: '' } : { status: 128, stdout: '', stderr: 'fatal: bad object' })
    const notes = releaseLedgerNotes(head, 'v0.1.0-beta.148', fakeGit)
    expect(notes.entries.length > 0 && notes.section.includes('ds-changes.json') && releaseNotesMissing(notes, notes.section).length === 0,
      `發版端:v0.1.0-beta.148 那一節 ${notes.entries.length} 條全部寫進說明、三段都在`)
    const victim = notes.entries[3].id
    const missing = releaseNotesMissing(notes, notes.section.split('\n').filter((l) => !l.includes(`\`${victim}\``)).join('\n'))
    expect(missing.length === 1 && missing[0] === victim, `發版端對照組:說明段少一行 → 只指名「${victim}」,實得 ${JSON.stringify(missing)}`)
    expect(releaseNotesMissing(notes, '  ').length === notes.entries.length + 3, '發版端:讀回空白說明 = 三段與全部條目都漏(不是通過)')
    const args = releaseCreateArgs({ tag: 'v0.1.0-beta.148', repository: 'ajenchen/design-system', gitHead: head }, notes.section)
    expect(args.includes('--generate-notes') && args[args.indexOf('--notes') + 1] === notes.section, '發版端:建 Release 的參數把同一段當 --notes')
    const none = releaseLedgerNotes(head, 'v9.9.9', fakeGit)
    expect(none.entries.length === 0 && releaseNotesMissing(none, none.section).length === 0 && /^## 破壞性變更\(0 條\)$/m.test(none.section),
      '發版端:帳本沒有那一節 → 三段照樣出、各寫「沒有登記」(段一個都不省)')
    let unreadable = false
    try { releaseLedgerNotes('1'.repeat(40), 'v0.1.0-beta.148', fakeGit) } catch { unreadable = true }
    expect(unreadable, '發版端:讀不到帳本要丟錯,不得當成「沒有變更」')
  } catch (e) {
    fails.push(`例外:發版端那一段跑不完 —— ${e.message}`)
  }

  // 真實資料(tag 上的 commit 永久不變;工作樹那一格量的是 0.1.0-beta.148 之後一直存在的差異):登記齊全綠、拿掉那幾條只指名它們
  const measurer = makeMeasurer()
  try {
    const ledger = readJson(join(PS_ROOT, LEDGER_REPO_PATH), LEDGER_REPO_PATH)
    const cell = (base, head, version, targets) => {
      const b = measurer.measure(base)
      const h = measurer.measure(head)
      const diffs = diffSurfaces(b.snap, h.snap)
      const label = `${base}→${head ?? '工作樹'}`
      expect(targets.every((t) => diffs.some((d) => d.target === t)), `真實資料 ${label}:量得到 ${targets.join('、')},實得 ${JSON.stringify(diffs.map((d) => d.target).filter((t) => targets.includes(t)))}`)
      const full = checkSection({ diffs, head: h.snap, ledger, version, pkgDir: h.pkgDir })
      expect(full.length === 0, `真實資料 ${label}:帳本 ${version} 節登記齊全 → 綠,實得 ${JSON.stringify(full.slice(0, 3))}`)
      const dropped = structuredClone(ledger)
      dropped.releases[version].changes = dropped.releases[version].changes.filter((e) => !targets.includes(e.target))
      const red = checkSection({ diffs, head: h.snap, ledger: dropped, version, pkgDir: h.pkgDir })
      expect(red.length === targets.length && targets.every((t) => red.some((p) => p.startsWith('漏寫') && p.includes(t))), `對照組(真實資料 ${label}):拿掉 ${targets.join('、')} → 只指名它們,實得 ${JSON.stringify(red)}`)
    }
    cell('v0.1.0-beta.146', 'v0.1.0-beta.147', '0.1.0-beta.147', ['CalendarOwnProps.onCreateEvent'])
    cell('v0.1.0-beta.147', 'v0.1.0-beta.148', '0.1.0-beta.148', ['AppShellProps.mainMinWidth', 'FileUpload.buttonLabel'])
    cell('v0.1.0-beta.148', null, '0.1.0-beta.149', ['InputProps.height', 'DataTableFilterPanelLabels.clearAll'])
  } catch (e) {
    fails.push(`${e instanceof SurfaceInstrumentError ? '儀器失效' : '例外'}:真實資料那一段跑不完(簽出要 fetch-depth: 0 帶 tag)—— ${String(e.message).split('\n')[0]}`)
  } finally { measurer.cleanup() }
  return fails
}

function main() {
  const args = process.argv.slice(2)
  const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  try {
    if (args.includes('--selftest')) {
      const fails = selftest()
      if (fails.length) { console.error(`✗ public-surface selftest:\n  ${fails.join('\n  ')}`); process.exit(1) }
      console.log(`✓ public-surface selftest:合成樹 ${ST_BREAKS.length} 類各破一處(含審查列的七種縮窄與新增必填)→ 都只指名那一處、登記齊全綠;同一棵樹量兩次 0 差異;帳本十種紅(寫了卻沒發生 / to 不存在 / spec 非出貨 / 段名不存在 / fix op / id 重複 / renamed 沒 to / do 超過三句 / 勘誤指錯 / 同名換義沒有 behavior 條目)與已發布節逐位元、下一版節判定;發版端說明三段由帳本產生、少一行只指名那一條;真實資料三段(146→147、147→148、148→工作樹)登記齊全綠、拿掉指定條目只指名它們`)
      return
    }
    const base = arg('base')
    const head = arg('head')
    if (head) {
      if (!base) throw new SurfaceInstrumentError('--head 要搭配 --base')
      const ledger = readJson(join(PS_ROOT, LEDGER_REPO_PATH), LEDGER_REPO_PATH)
      const measurer = makeMeasurer()
      try {
        const r = checkRange({ base, head, ledger, measurer })
        console.log(`# ${base} → ${head}:偵測到 ${r.diffs.length} 個破壞性差異(對帳本 releases["${r.version}"])`)
        for (const d of r.diffs) console.log(`- ${d.surface}\t${d.change}\t${d.target}\t${d.detail}`)
        for (const p of r.problems) console.error(`✗ ${p}`)
        if (r.problems.length) process.exit(1)
        console.log(`✓ public-surface:${base} → ${head} 的 ${r.diffs.length} 個差異全部登記在 releases["${r.version}"]`)
      } finally { measurer.cleanup() }
      return
    }
    const r = check({ base })
    if (args.includes('--skeleton')) {
      console.log(JSON.stringify(r.diffs.map((d) => skeletonOf(d, r.version)), null, 2))
      return
    }
    for (const p of r.problems) console.error(`✗ ${p}`)
    if (r.problems.length) { console.error(`\n✗ public-surface:${r.problems.length} 筆(對 ${r.tag};下一版 ${r.version ?? '?'})`); process.exit(1) }
    console.log(`✓ public-surface:對 ${r.tag} 的 ${r.diffs.length} 個破壞性差異全部寫在 ${LEDGER_REPO_PATH} releases["${r.version}"](出口 ${r.baseSize} → ${r.headSize})${r.bootstrap?.length ? `;回填節逐段對 tag 驗過:${r.bootstrap.join('、')}` : ';已發布的節與 tag 逐位元相同'}`)
  } catch (e) {
    if (e instanceof SurfaceInstrumentError || e instanceof LedgerError) { console.error(`INSTRUMENT-FAIL public-surface:${e.message}`); process.exit(2) }
    throw e
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
