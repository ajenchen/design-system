#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 跟「上一個發布 tag」比,下面兩種改動在變更帳本 `packages/design-system/ds-changes.json`「下一版」那一節都有對應登記 ——
 *         發版說明(scripts/release-github-release.mjs 依序產生「新增 / 行為與畫面變更 / 破壞性變更」三段)才不會漏寫:
 *         (1) 改到「預覽看得見」的檔:集合 = scripts/release-orchestrator.mjs 的 PRODUCT_VISIBLE(發版同意綁的同一份,不另立清單);
 *             tag 與工作樹之間新增 / 修改 / 刪除的檔(含還沒 git add 的新檔)。每個檔都要被這一節某一條的 paths 涵蓋:
 *             added(新增)/ updated(行為與畫面變更)/ changes(破壞性變更,帶 paths 時)/ noVisibleChange(無使用者可見變化,一定附 reason)。
 *         (2) 新增的公開出口:scripts/lib/public-surface.mjs 量的同一套 exports(子路徑 + 每個子路徑的出口名;measureExports + exportAdditions)。
 *             每個新子路徑 / 新出口名(或既有名字多了能 import 它的子路徑)都要被涵蓋:added 的 target / exports、noVisibleChange 的 exports、
 *             changes 的 target / to(改名的新名字);新出口若來自一個已被涵蓋的新子路徑,算一起涵蓋。
 *         登記規則(哪些改動算哪一類、誰在什麼時候登記 = 改動的作者在同一個 commit 寫):
 *         packages/design-system/ds-canonical/references/props-naming.md「相容政策」。
 *   紅: 漏登記(預覽看得見的檔 / 新增出口 / 新子路徑沒有任何一條涵蓋,印出可貼上的骨架)/ 寫了卻沒改(某條的 paths 對不到任何跟 tag 不同的檔、
 *       added / noVisibleChange 的 exports 列了不是新增的名字)/ added、updated 的 spec 不是工作樹的出貨檔或檔裡沒有那個段名 /
 *       帳本形狀錯(ledger.mjs ledgerShapeProblems:paths 太寬或用萬用字元、noVisibleChange 沒有 reason、note 不是一到三句、id 重複 …)/
 *       這一節依 renderer 產生的說明過不了發版端的讀回驗收(三個段名依序都在、每個條目 id 都在)→ 指名並 exit 1。
 *   綠: 上面全部 0 筆。純靜態:git diff / ls-files 讀檔名 + git archive 上一個 tag + TypeScript checker 讀出口名,沒有時序、取樣或網路。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 找不到上一個發布 tag(CI 要 fetch-depth: 0 帶 tag)、git diff / ls-files 失敗、
 *       PRODUCT_VISIBLE 讀不到或是空的、任一邊量到 0 個出口、帳本讀不到或不是合法 JSON —— 不讀成通過。
 *   對照組(--selftest): 合成資料逐條各紅一面、登記齊全必綠;renderer 三段依序、少一段 / 換順序 / 少一個 id 只指名那一處;
 *       真實資料:v0.1.0-beta.148 → v0.1.0-beta.149 改到的預覽看得見的檔照新規則全部紅(beta.149 只有破壞性變更段的根因),
 *       每個檔各給一條精確豁免後全綠、拿掉其中一條只指名那一個檔;同一段新增的出口(isLinkInputValueLinkable、SurfaceEyebrow、
 *       ./ds-changes.json 等)沒登記必紅、登記後綠。
 *
 * 用法:
 *   node scripts/release-notes-coverage-invariant.mjs              上一個發布 tag → 工作樹,對帳本「下一版」那一節
 *   node scripts/release-notes-coverage-invariant.mjs --selftest
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCT_VISIBLE } from './release-orchestrator.mjs'
import { exportAdditions, measureExports, SurfaceInstrumentError } from './lib/public-surface.mjs'
import { archiveTree, lastReleaseTag, resolveCurrentVersion, specProblem } from './public-surface-invariant.mjs'
import {
  LEDGER_NOTE_KINDS, LEDGER_REPO_PATH, LedgerError, ledgerShapeProblems, pathCovers, releaseNotesMissingFromText, renderReleaseNotes,
} from '../packages/design-system/tools/changes/ledger.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = 'packages/design-system'
const INSTRUMENT_FAIL = 'INSTRUMENT-FAIL'

export const isProductVisible = (path, patterns = PRODUCT_VISIBLE) => patterns.some((re) => re.test(path))

/** 一節裡會涵蓋東西的每一條:{ label, paths, names } —— names = 它涵蓋的出口名 / 子路徑 */
function coverers(section) {
  const rows = []
  for (const e of section.changes ?? []) rows.push({ label: e.id, kind: 'changes', paths: e.paths ?? [], names: [e.target, e.to].filter(Boolean) })
  for (const kind of Object.keys(LEDGER_NOTE_KINDS)) {
    for (const e of section[kind] ?? []) rows.push({ label: e.id, kind, paths: e.paths ?? [], names: kind === 'added' ? [e.target, ...(e.exports ?? [])] : [] })
  }
  ;(section.noVisibleChange ?? []).forEach((e, i) => rows.push({ label: `noVisibleChange[${i}]`, kind: 'noVisibleChange', paths: e.paths ?? [], names: e.exports ?? [] }))
  return rows
}

/**
 * 純函式:一節的登記 ↔ 這一版的改動。
 * changedFiles = 跟 tag 不同的全部檔(repo 相對路徑);additions = exportAdditions();pkgDir = 工作樹的 packages/design-system(查 spec;null = 不查)。
 */
export function coverageProblems({ section = {}, version, changedFiles, additions, pkgDir = null, patterns = PRODUCT_VISIBLE }) {
  const problems = []
  const at = `${LEDGER_REPO_PATH} releases["${version}"]`
  const rows = coverers(section ?? {})
  const changed = [...new Set(changedFiles)].sort()
  const product = changed.filter((f) => isProductVisible(f, patterns))
  for (const f of product) {
    if (!rows.some((r) => r.paths.some((p) => pathCovers(p, f)))) problems.push(`漏登記(預覽看得見的檔):${f} —— ${at} 沒有任何一條的 paths 涵蓋它`)
  }
  const newSubpaths = new Set(additions.filter((a) => a.surface === 'subpath').map((a) => a.target))
  const covered = (name) => rows.some((r) => r.names.includes(name))
  for (const a of additions) {
    if (a.surface === 'subpath') {
      if (!covered(a.target)) problems.push(`漏登記(新子路徑):${a.target}(${a.detail})—— ${at} 的 added 寫一條 target = "${a.target}",或在 noVisibleChange 的 exports 列它並寫理由`)
      continue
    }
    const viaSubpath = (a.subpaths ?? []).some((sp) => newSubpaths.has(sp) && covered(sp))
    if (!covered(a.target) && !viaSubpath) problems.push(`漏登記(新增出口):${a.target}(${a.detail})—— ${at} 的 added 寫一條 target = "${a.target}"(或列進某條 added 的 exports),或在 noVisibleChange 的 exports 列它並寫理由`)
  }
  for (const r of rows) {
    for (const p of r.paths) {
      if (!changed.some((f) => pathCovers(p, f))) problems.push(`寫了卻沒改:${at} ${r.label} 的 paths「${p}」對不到任何跟上一個發布 tag 不同的檔 —— 路徑寫錯、或那個改動已經還原(拿掉這一項)`)
    }
  }
  const added = new Set(additions.map((a) => a.target))
  for (const e of section?.added ?? []) for (const x of e.exports ?? []) if (!added.has(x)) problems.push(`寫了卻沒加:${at} ${e.id} 的 exports「${x}」不是這一版新增的出口 / 子路徑`)
  ;(section?.noVisibleChange ?? []).forEach((e, i) => {
    for (const x of e.exports ?? []) if (!added.has(x)) problems.push(`寫了卻沒加:${at} noVisibleChange[${i}] 的 exports「${x}」不是這一版新增的出口 / 子路徑`)
  })
  if (pkgDir) {
    for (const kind of Object.keys(LEDGER_NOTE_KINDS)) {
      for (const e of section?.[kind] ?? []) {
        if (typeof e?.spec !== 'string') continue
        const p = specProblem(e.spec, pkgDir)
        if (p) problems.push(`${at} ${e.id}:${p}`)
      }
    }
  }
  return problems
}

/** 這一節照 renderer 產生的說明,過得了發版端同一支讀回驗收(三段依序、每個 id 都在)嗎 */
export function renderedNotesProblems(ledger, version) {
  const missing = releaseNotesMissingFromText(ledger, version, renderReleaseNotes(ledger, version))
  return missing.length ? [`renderer 產生的說明過不了讀回驗收,缺:${missing.join('、')}(packages/design-system/tools/changes/ledger.mjs renderReleaseNotes ↔ releaseNotesMissingFromText)`] : []
}

/** 漏登記時可貼上的骨架(依資料夾分組:元件資料夾一條;其他檔一條一個檔) */
export function skeletonFor(problems, version) {
  const files = problems.filter((p) => p.startsWith('漏登記(預覽看得見的檔)')).map((p) => p.slice(p.indexOf(':') + 1, p.indexOf(' —— ')))
  const groups = new Map()
  for (const f of files) {
    const segs = f.split('/')
    const key = segs[0] === 'packages' && segs[2] === 'src' && segs.length > 5 ? `${segs.slice(0, 5).join('/')}/` : f
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  return [...groups.keys()].map((paths) => ({
    id: `${version}/${paths.replace(/\/$/, '').split('/').pop().replace(/[^A-Za-z0-9._:-]+/g, '-')}`,
    target: '<消費端寫得出來的名字:元件 / 出口 / 型別.成員>', note: '<一到三句:消費端看得到什麼>', spec: '<出貨檔路徑「段名」>', paths: [paths],
  }))
}

// ── git ─────────────────────────────────────────────────────────────────────────
const git = (args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const nulList = (text) => String(text).split('\0').filter(Boolean)

/** tag 與工作樹之間不同的檔(新增 / 修改 / 刪除;改名拆成刪 + 增)+ 還沒 add 的新檔 */
export function changedSince(tag, cwd = ROOT) {
  const diff = git(['diff', '--name-only', '--no-renames', '-z', tag, '--'], cwd)
  if (diff.status !== 0) throw new SurfaceInstrumentError(`git diff ${tag} 失敗:${String(diff.stderr).trim().slice(0, 160)}`)
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], cwd)
  if (untracked.status !== 0) throw new SurfaceInstrumentError(`git ls-files --others 失敗:${String(untracked.stderr).trim().slice(0, 160)}`)
  return [...new Set([...nulList(diff.stdout), ...nulList(untracked.stdout)])].sort()
}
function changedBetween(base, head) {
  const diff = git(['diff', '--name-only', '--no-renames', '-z', base, head, '--'])
  if (diff.status !== 0) throw new SurfaceInstrumentError(`git diff ${base} ${head} 失敗:${String(diff.stderr).trim().slice(0, 160)}`)
  return nulList(diff.stdout).sort()
}
function readJson(abs, label) {
  if (!existsSync(abs)) throw new SurfaceInstrumentError(`${label} 不存在`)
  try { return JSON.parse(readFileSync(abs, 'utf8')) } catch (e) { throw new SurfaceInstrumentError(`${label} 不是合法 JSON:${e.message}`) }
}
function exportsAt(tag) {
  const dir = archiveTree(tag)
  try { return measureExports(dir, ROOT) } finally { rmSync(dir, { recursive: true, force: true }) }
}
function assertMeasured(snap, label) {
  const n = [...snap.exports.values()].reduce((sum, bySp) => sum + bySp.size, 0)
  if (!snap.subpaths.size || !n) throw new SurfaceInstrumentError(`${label} 量到 ${snap.subpaths.size} 個子路徑、${n} 個出口`)
}

export function check() {
  if (!Array.isArray(PRODUCT_VISIBLE) || !PRODUCT_VISIBLE.length) throw new SurfaceInstrumentError('scripts/release-orchestrator.mjs 的 PRODUCT_VISIBLE 讀不到或是空的 —— 沒有清單不是沒有改動')
  const tag = lastReleaseTag()
  if (!tag) throw new SurfaceInstrumentError('找不到上一個發布的 tag(v*)—— CI 要 fetch-depth: 0 帶 tag;沒比到不是通過')
  const ledger = readJson(join(ROOT, LEDGER_REPO_PATH), LEDGER_REPO_PATH)
  const pkg = readJson(join(ROOT, PKG, 'package.json'), `${PKG}/package.json`)
  const shape = ledgerShapeProblems(ledger)
  if (shape.length) return { tag, version: null, problems: shape.map((p) => `帳本形狀:${p}`), changed: [], product: [], additions: [] }
  const { version } = resolveCurrentVersion({ ledger, baseVersion: tag.replace(/^v/, ''), pkgVersion: pkg.version })
  const changed = changedSince(tag)
  const before = exportsAt(tag)
  const after = measureExports(ROOT, ROOT)
  assertMeasured(before, tag)
  assertMeasured(after, '工作樹')
  const additions = exportAdditions(before, after)
  const section = ledger.releases[version] ?? {}
  const problems = [
    ...coverageProblems({ section, version, changedFiles: changed, additions, pkgDir: join(ROOT, PKG) }),
    ...renderedNotesProblems(ledger, version),
  ]
  return { tag, version, problems, changed, product: changed.filter((f) => isProductVisible(f)), additions }
}

// ── selftest ─────────────────────────────────────────────────────────────────────
function selftest() {
  const fails = []
  const expect = (c, m) => { if (!c) fails.push(m) }
  const V = '9.9.10'
  const one = (label, problems, needle) => expect(problems.length === 1 && problems[0].includes(needle), `${label}:應只有一筆含「${needle}」,實得 ${JSON.stringify(problems)}`)

  // 合成資料:兩個預覽看得見的檔、一個不在清單裡的檔、兩個新增出口(一個帶新子路徑)
  const changedFiles = [
    'packages/design-system/src/components/Foo/foo.tsx',
    'packages/design-system/src/components/Foo/foo.stories.tsx',
    'packages/design-system/src/components/Bar/bar.css',
    'scripts/some-tool.mjs',
  ]
  const additions = [
    { surface: 'subpath', target: './components/Foo', detail: '新的子路徑' },
    { surface: 'export', target: 'Foo', subpaths: ['.', './components/Foo'], detail: '新出口' },
    { surface: 'export', target: 'barHelper', subpaths: ['.'], detail: '新出口' },
  ]
  const green = {
    changes: [],
    added: [
      { id: `${V}/Foo`, target: './components/Foo', note: '新元件 Foo。', spec: 'src/x.spec.md「a」', paths: ['packages/design-system/src/components/Foo/foo.tsx'] },
      { id: `${V}/barHelper`, target: 'barHelper', note: '新出口。', spec: 'src/x.spec.md「a」', paths: ['scripts/some-tool.mjs'] },
    ],
    updated: [{ id: `${V}/Bar`, target: 'Bar', note: 'Bar 的間距改了。', spec: 'src/x.spec.md「a」', paths: ['packages/design-system/src/components/Bar/'] }],
    noVisibleChange: [{ paths: ['packages/design-system/src/components/Foo/foo.stories.tsx'], reason: '只改範例的說明文字。' }],
  }
  const run = (section, files = changedFiles, adds = additions) => coverageProblems({ section, version: V, changedFiles: files, additions: adds })
  expect(run(green).length === 0, `合成綠:每個預覽看得見的檔與新增出口都有涵蓋(不在清單裡的 scripts/ 不要求),實得 ${JSON.stringify(run(green))}`)
  expect(ledgerShapeProblems({ releases: { [V]: green } }).length === 0, `合成綠:形狀正確,實得 ${JSON.stringify(ledgerShapeProblems({ releases: { [V]: green } }))}`)
  {
    const s = structuredClone(green); s.updated = []
    one('紅:改了 CSS 卻沒登記', run(s), 'components/Bar/bar.css')
  }
  {
    const s = structuredClone(green); s.noVisibleChange = []
    one('紅:範例檔沒登記也沒豁免', run(s), 'foo.stories.tsx')
  }
  {
    const s = structuredClone(green); s.added = s.added.filter((e) => e.target !== 'barHelper'); s.noVisibleChange[0].paths.push('scripts/some-tool.mjs')
    one('紅:新增出口沒登記', run(s), '漏登記(新增出口):barHelper')
  }
  {
    const s = structuredClone(green); s.added[0].target = 'FooOnly'
    const p = run(s)
    expect(p.length === 2 && p.some((x) => x.includes('新子路徑):./components/Foo')) && p.some((x) => x.includes('新增出口):Foo')), `紅:新子路徑沒涵蓋 → 子路徑與只從它來的出口各一筆,實得 ${JSON.stringify(p)}`)
  }
  {
    const s = structuredClone(green); s.changes = [{ id: `${V}/x`, surface: 'export', target: 'oldBar', change: 'renamed', to: 'barHelper', do: '改名。', spec: 'src/x.spec.md「a」', paths: ['packages/design-system/src/components/Bar/bar.css'] }]
    s.added = s.added.filter((e) => e.target !== 'barHelper'); s.updated = []; s.noVisibleChange[0].paths.push('scripts/some-tool.mjs')
    expect(run(s).length === 0, `綠:破壞性變更條目帶 paths 也算涵蓋;改名的 to 涵蓋新出口名,實得 ${JSON.stringify(run(s))}`)
  }
  {
    const s = structuredClone(green); s.updated[0].paths.push('packages/design-system/src/components/Baz/baz.tsx')
    one('紅:paths 寫了卻沒改', run(s), '寫了卻沒改')
  }
  {
    const s = structuredClone(green); s.added[1].exports = ['Foo2']
    one('紅:exports 列了不是新增的名字', run(s), '寫了卻沒加')
  }
  {
    const s = structuredClone(green); s.noVisibleChange.push({ exports: ['barHelper'], reason: '只給 DS 內部用。' }); s.added = s.added.filter((e) => e.target !== 'barHelper'); s.noVisibleChange[0].paths.push('scripts/some-tool.mjs')
    expect(run(s).length === 0, `綠:noVisibleChange 的 exports 豁免新增出口,實得 ${JSON.stringify(run(s))}`)
  }
  expect(run({}, ['scripts/a.mjs', 'packages/governance/x.mjs'], []).length === 0, '綠:只改不在 PRODUCT_VISIBLE 的檔、沒有新增出口 → 不要求登記')
  expect(run({}, ['.storybook/preview.tsx'], []).length === 1 && run({}, ['apps/template/src/App.stories.tsx'], []).length === 1, '紅:.storybook/ 與 apps/**/*.stories 也是 PRODUCT_VISIBLE(清單只讀 release-orchestrator.mjs)')
  // 帳本形狀(ledger.mjs)
  const shape = (label, section, needle) => {
    const p = ledgerShapeProblems({ releases: { [V]: { changes: [], ...section } } })
    expect(p.some((x) => x.includes(needle)), `形狀紅(${label}):應有「${needle}」,實得 ${JSON.stringify(p)}`)
  }
  shape('paths 太寬', { noVisibleChange: [{ paths: ['packages/design-system/src/'], reason: '重構。' }] }, '太寬')
  shape('paths 只到 components/', { updated: [{ ...green.updated[0], paths: ['packages/design-system/src/components/'] }] }, '太寬')
  shape('paths 萬用字元', { updated: [{ ...green.updated[0], paths: ['packages/design-system/src/components/*/x.tsx'] }] }, '萬用字元')
  shape('豁免沒理由', { noVisibleChange: [{ paths: ['packages/design-system/src/components/Foo/foo.tsx'] }] }, 'reason 空白')
  shape('豁免沒寫範圍', { noVisibleChange: [{ reason: '沒有差別。' }] }, '要寫 paths 或 exports')
  shape('added 沒 paths', { added: [{ id: `${V}/a`, target: 'A', note: '新。', spec: 'src/x.spec.md「a」' }] }, 'paths 要是非空陣列')
  shape('updated 不收 exports', { updated: [{ ...green.updated[0], exports: ['Bar'] }] }, '不認得欄位「exports」')
  shape('note 超過三句', { updated: [{ ...green.updated[0], note: '一。二。三。四。' }] }, 'note 要一到三句')
  shape('id 與 changes 重複', { changes: [{ id: `${V}/Bar`, surface: 'export', target: 'Bar', change: 'removed', do: '刪。', spec: 'src/x.spec.md「a」' }], updated: [green.updated[0]] }, '重複')
  shape('id 不是這一版', { added: [{ ...green.added[0], id: '9.9.9/Foo' }] }, 'id 要寫成')
  // renderer ↔ 讀回驗收(release-github-release 用同一支)
  const ledger = { releases: { [V]: { ...green, changes: [{ id: `${V}/old`, surface: 'export', target: 'old', change: 'removed', do: '刪掉。', spec: 'src/x.spec.md「a」' }] } } }
  const notes = renderReleaseNotes(ledger, V)
  const heads = ['## 新增(2 條)', '## 行為與畫面變更(1 條)', '## 破壞性變更(1 條)'].map((h) => notes.indexOf(h))
  expect(heads.every((i) => i >= 0) && heads[0] < heads[1] && heads[1] < heads[2], `renderer:三段依序「新增 → 行為與畫面變更 → 破壞性變更」,實得位置 ${JSON.stringify(heads)}`)
  expect(releaseNotesMissingFromText(ledger, V, notes).length === 0, 'renderer 綠:自己產生的說明過得了讀回驗收')
  const dropLine = (needle) => notes.split('\n').filter((l) => !l.includes(needle)).join('\n')
  one('讀回紅:少了「行為與畫面變更」段名', releaseNotesMissingFromText(ledger, V, dropLine('## 行為與畫面變更')), '## 行為與畫面變更')
  one('讀回紅:少了新增條目一行', releaseNotesMissingFromText(ledger, V, dropLine(`\`${V}/barHelper\``)), `${V}/barHelper`)
  {
    const [a, b, c] = notes.split(/\n(?=## )/)
    one('讀回紅:段落順序錯(破壞性變更放最前)', releaseNotesMissingFromText(ledger, V, [c, a, b].join('\n')), '## ')
  }
  expect(releaseNotesMissingFromText(ledger, V, ' ').length === 3 + 4, '讀回紅:空白說明 = 三段與四個 id 全缺(不是通過)')
  const empty = renderReleaseNotes({ releases: {} }, V)
  expect(/^## 新增\(0 條\)$/m.test(empty) && /^## 行為與畫面變更\(0 條\)$/m.test(empty) && /^## 破壞性變更\(0 條\)$/m.test(empty) && releaseNotesMissingFromText({ releases: {} }, V, empty).length === 0,
    'renderer:帳本沒有這一節 → 三段照樣出、各寫「沒有登記」')
  expect(renderedNotesProblems(ledger, V).length === 0, 'renderedNotesProblems 綠')

  // 真實資料(tag 上的 commit 永久不變):v0.1.0-beta.148 → v0.1.0-beta.149
  try {
    const real = JSON.parse(readFileSync(join(ROOT, LEDGER_REPO_PATH), 'utf8'))
    const v149 = '0.1.0-beta.149'
    const files = changedBetween('v0.1.0-beta.148', 'v0.1.0-beta.149')
    const product = files.filter((f) => isProductVisible(f))
    expect(product.length > 100, `真實資料:beta.148 → beta.149 改到的預覽看得見的檔應有上百個,實得 ${product.length}(量具失效?)`)
    const asShipped = coverageProblems({ section: real.releases[v149], version: v149, changedFiles: files, additions: [] })
    expect(asShipped.filter((p) => p.startsWith('漏登記(預覽看得見的檔)')).length === product.length,
      `對照組(真實資料):beta.149 那一節只有破壞性變更、沒有 paths → 照新規則 ${product.length} 個檔全部漏登記,實得 ${asShipped.length}`)
    const exempt = (list) => ({ changes: [], noVisibleChange: list.map((f) => ({ paths: [f], reason: '對照組:逐檔豁免。' })) })
    expect(coverageProblems({ section: exempt(product), version: v149, changedFiles: files, additions: [] }).length === 0, '真實資料:每個檔各給一條精確豁免 → 綠')
    const victim = product[Math.floor(product.length / 2)]
    one('對照組(真實資料):拿掉一條豁免', coverageProblems({ section: exempt(product.filter((f) => f !== victim)), version: v149, changedFiles: files, additions: [] }), victim)
    const adds = exportAdditions(exportsAt('v0.1.0-beta.148'), exportsAt('v0.1.0-beta.149'))
    const known = ['isLinkInputValueLinkable', 'SurfaceEyebrow', './ds-changes.json']
    expect(known.every((t) => adds.some((a) => a.target === t)), `真實資料:beta.148 → beta.149 量得到新增的 ${known.join('、')},實得 ${JSON.stringify(adds.map((a) => a.target))}`)
    const unregistered = coverageProblems({ section: exempt(product), version: v149, changedFiles: files, additions: adds })
    expect(unregistered.length === adds.length && known.every((t) => unregistered.some((p) => p.includes(`):${t}(`))), `對照組(真實資料):新增出口沒登記 → ${adds.length} 筆全紅,實得 ${unregistered.length}`)
    const registered = { ...exempt(product), added: [{ id: `${v149}/all`, target: adds[0].target, note: '對照組。', spec: 'src/x.spec.md「a」', paths: [product[0]], exports: adds.slice(1).map((a) => a.target) }] }
    expect(coverageProblems({ section: registered, version: v149, changedFiles: files, additions: adds }).length === 0, '真實資料:新增出口全部登記 → 綠')
  } catch (e) {
    fails.push(`${e instanceof SurfaceInstrumentError ? '儀器失效' : '例外'}:真實資料那一段跑不完(簽出要 fetch-depth: 0 帶 tag)—— ${String(e.message).split('\n')[0]}`)
  }
  return fails
}

function main() {
  const args = process.argv.slice(2)
  try {
    if (args.includes('--selftest')) {
      const fails = selftest()
      if (fails.length) { console.error(`✗ release-notes-coverage selftest:\n  ${fails.join('\n  ')}`); process.exit(1) }
      console.log('✓ release-notes-coverage selftest:合成資料逐條各紅一面(漏登記的檔 / 新增出口 / 新子路徑、寫了卻沒改、寫了卻沒加、形狀十種)、登記齊全綠;renderer 三段依序,讀回少段名 / 換順序 / 少 id 只指名那一處;真實資料 beta.148 → beta.149 照新規則全紅、逐檔豁免綠、拿掉一條只指名那個檔,新增出口沒登記紅、登記後綠')
      return
    }
    const r = check()
    for (const p of r.problems) console.error(`✗ ${p}`)
    if (r.problems.length) {
      const sk = skeletonFor(r.problems, r.version)
      if (sk.length) console.error(`\n骨架(貼進 ${LEDGER_REPO_PATH} releases["${r.version}"]:新增 → added;既有東西不用改程式、但畫面或行為變了 → updated;消費端看不到差異 → 改寫成 noVisibleChange: { paths, reason }。規則見 props-naming.md「相容政策」):\n${JSON.stringify(sk, null, 2)}`)
      console.error(`\n✗ release-notes-coverage:${r.problems.length} 筆(對 ${r.tag};下一版 ${r.version ?? '?'})`)
      process.exit(1)
    }
    console.log(`✓ release-notes-coverage:對 ${r.tag} 改到的 ${r.product.length} 個預覽看得見的檔與 ${r.additions.length} 個新增出口,全部登記在 ${LEDGER_REPO_PATH} releases["${r.version}"](改到的檔共 ${r.changed.length} 個)`)
  } catch (e) {
    if (e instanceof SurfaceInstrumentError || e instanceof LedgerError) { console.error(`${INSTRUMENT_FAIL} release-notes-coverage:${e.message}`); process.exit(2) }
    throw e
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
