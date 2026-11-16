#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: packages/design-system/src 底下每一支 *.spec.md 與 *.tsx(整檔,不只這次改到的字)裡的世界級對照宣稱,
 *         段裡**每一個**被提到的名稱都有自己的一手來源(M22)。判定讀 hook 同一支實作
 *         packages/design-system/ds-canonical/hooks/lib/benchmark-citation.mjs(名稱 / 網域表 benchmark-citation-sources.json)。
 *         元件規格(components/**\/*.spec.md)是零證據債範圍:一段都不准、也不准有撤回標記;
 *         其他規格與 tsx 走棘輪 scripts/benchmark-citation-baseline.json(每檔段數只准變少,新檔有一段就紅)。
 *   紅: 元件規格出現任一段沒來源 / partial(一家有來源、另一家沒有)/ 撤回標記;其他規格或 tsx 的某檔段數超過棘輪(含不在表上的檔)
 *       → 指名 file:line、缺哪幾家,exit 1。--selftest 三組對照:(A)判定表每格兩面(有來源 / 沒來源 / partial / tsx 範例資料 /
 *       程式碼框 / 豁免標記 …)同時跑實作本身與真的 hook,兩邊必須同判;(B)合成樹三類各放一支違規檔,三類都要被掃到;
 *       (C)棘輪比對(新檔 / 變多紅、持平 / 變少綠、元件規格不吃棘輪)。
 *   綠: 元件規格 0 段、其他兩類不超過棘輪。純靜態、不讀時間、不取樣,同一份樹重複跑結果恆等。
 *   註: 2026-11-16 A29 新寫。寫入當下的 hook 只看「這次寫進去的字」,舊段從沒被機器檢查過(2026-11-05 K8 盤點:
 *        元件規格光原 13 名稱就有 237 段沒來源,hook 檔頭卻寫「beta.107 已清完」);hook 是加速器,這支在 CI 跑才算數。
 *
 * 用法:
 *   node scripts/benchmark-citation-invariant.mjs                    判定
 *   node scripts/benchmark-citation-invariant.mjs --list [--json]    列出每一段(分批修用)
 *   node scripts/benchmark-citation-invariant.mjs --update-baseline  修掉之後收緊棘輪(只減不加)
 *   node scripts/benchmark-citation-invariant.mjs --selftest         對照組
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeText, compileJudge, scopeOf } from '../packages/design-system/ds-canonical/hooks/lib/benchmark-citation.mjs'
import { isDirectRun } from './lib/direct-run.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = 'scripts/benchmark-citation-baseline.json'
const HOOK_PATH = 'packages/design-system/ds-canonical/hooks/check_benchmark_citation.sh'
const SCAN_ROOT = 'packages/design-system/src'
const SCOPES = ['component-spec', 'other-spec', 'tsx']
const SKIP_DIR = new Set(['node_modules', 'dist', 'storybook-static'])

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries.sort()) {
    if (SKIP_DIR.has(name)) continue
    const full = join(dir, name)
    const info = statSync(full)
    if (info.isDirectory()) yield* walk(full)
    else yield full
  }
}

/** 整棵樹:每支在範圍內的檔整檔交給共用實作 */
export function scanTree(root, judge = compileJudge()) {
  const filesByScope = Object.fromEntries(SCOPES.map((scope) => [scope, 0]))
  const findings = []
  const markers = []
  const allowlisted = []
  for (const full of walk(join(root, SCAN_ROOT))) {
    const file = relative(root, full).split(sep).join('/')
    const scope = scopeOf(file)
    if (!scope) continue
    filesByScope[scope] += 1
    const result = analyzeText(readFileSync(full, 'utf8'), { path: file, judge })
    if (result.status === 'allowlisted') { allowlisted.push(file); continue }
    for (const marker of result.markers ?? []) markers.push({ file, scope, ...marker })
    for (const finding of result.violations) findings.push({ file, scope, ...finding })
  }
  return { filesByScope, findings, markers, allowlisted }
}

const countByFile = (findings) => findings.reduce((acc, { file }) => ({ ...acc, [file]: (acc[file] ?? 0) + 1 }), {})

/** 棘輪比對:元件規格不吃棘輪(零證據債);其他兩類每檔段數只准 ≤ 棘輪 */
export function evaluate({ findings, markers }, baselineFiles) {
  const problems = []
  const shrunk = []
  for (const finding of findings.filter((item) => item.scope === 'component-spec')) {
    problems.push({ file: finding.file, why: `元件規格 L${finding.line}(${finding.kind},缺 ${finding.missing.join(' / ')}):${finding.text.slice(0, 90)}` })
  }
  for (const marker of markers) {
    problems.push({ file: marker.file, why: `元件規格 L${marker.line} 有撤回 / 豁免標記(零證據債範圍禁用):${marker.text.slice(0, 90)}` })
  }
  const counts = countByFile(findings.filter((item) => item.scope !== 'component-spec'))
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baselineFiles[file] ?? 0
    if (count > allowed) {
      const lines = findings.filter((item) => item.file === file).map((item) => `L${item.line}(缺 ${item.missing.join(' / ')})`).join('、')
      problems.push({ file, why: `${count} 段沒有逐家來源,棘輪 ${allowed}${allowed ? '' : '(不在表上)'}:${lines}` })
    }
  }
  for (const [file, allowed] of Object.entries(baselineFiles)) {
    if ((counts[file] ?? 0) < allowed) shrunk.push(file)
  }
  return { problems, shrunk }
}

function readBaseline(root) {
  const document = JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8'))
  const files = document.files ?? {}
  for (const [file, count] of Object.entries(files)) {
    if (!Number.isInteger(count) || count <= 0) throw new Error(`${BASELINE_PATH}:${file} 的段數必須是正整數,實得 ${count}`)
    if (scopeOf(file) === 'component-spec') throw new Error(`${BASELINE_PATH}:${file} 是元件規格 —— 零證據債範圍不准進棘輪`)
  }
  return { document, files }
}

function printFindings(findings) {
  for (const scope of SCOPES) {
    const list = findings.filter((item) => item.scope === scope)
    if (!list.length) continue
    console.log(`\n## ${scope}(${list.length} 段 / ${new Set(list.map((item) => item.file)).size} 檔)`)
    for (const item of list) {
      console.log(`  ${item.file}:${item.line} [${item.kind}] 缺 ${item.missing.join(' / ')} —— ${item.text.slice(0, 120)}`)
    }
  }
}

function main() {
  const judge = compileJudge()
  const tree = scanTree(ROOT, judge)
  if (process.argv.includes('--list')) {
    if (process.argv.includes('--json')) console.log(JSON.stringify(tree, null, 2))
    else printFindings(tree.findings)
    return 0
  }
  const { document, files } = readBaseline(ROOT)
  if (process.argv.includes('--update-baseline')) {
    const counts = countByFile(tree.findings.filter((item) => item.scope !== 'component-spec'))
    const next = Object.fromEntries(Object.entries(files)
      .map(([file, allowed]) => [file, Math.min(allowed, counts[file] ?? 0)])
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => (left < right ? -1 : 1)))
    writeFileSync(join(ROOT, BASELINE_PATH), `${JSON.stringify({ ...document, files: next }, null, 2)}\n`)
    console.log(`棘輪已收緊:${Object.keys(files).length} → ${Object.keys(next).length} 檔(只減不加;新的段要嘛補來源,要嘛照 M22 改寫)`)
    return 0
  }
  // 量具自檢:三類都要真的掃到檔 —— 走訪漏掉一整類時這裡先紅,不讓「0 段」變成假綠
  const emptyScopes = SCOPES.filter((scope) => tree.filesByScope[scope] === 0)
  const byScope = (scope) => tree.findings.filter((item) => item.scope === scope).length
  console.log(`掃描 ${SCAN_ROOT}:元件規格 ${tree.filesByScope['component-spec']} 檔 / 其他規格 ${tree.filesByScope['other-spec']} 檔 / tsx ${tree.filesByScope.tsx} 檔(檔頭整檔豁免 ${tree.allowlisted.length} 檔,數量與期限歸 exemption-expiry 管)`)
  console.log(`沒有逐家來源的段:元件規格 ${byScope('component-spec')}(零證據債)/ 其他規格 ${byScope('other-spec')} / tsx ${byScope('tsx')}(棘輪 ${Object.values(files).reduce((sum, count) => sum + count, 0)} 段 / ${Object.keys(files).length} 檔)`)
  if (emptyScopes.length) {
    console.log(`\n✗ INSTRUMENT-FAIL:${emptyScopes.join(' / ')} 一支檔都沒掃到 —— 走訪壞了,這次的 0 段不是證據`)
    return 1
  }
  const { problems, shrunk } = evaluate(tree, files)
  if (shrunk.length) console.log(`\nⓘ 棘輪可收緊 ${shrunk.length} 檔(跑 --update-baseline):${shrunk.slice(0, 6).join(', ')}${shrunk.length > 6 ? ' …' : ''}`)
  if (problems.length) {
    console.log(`\n✗ ${problems.length} 處世界級對照缺逐家一手來源(M22;補該家自己的官網 / 原始碼網址並確認它支持那句話,或改寫成 DS 內部理由):`)
    for (const { file, why } of problems) console.log(`  - ${file}:${why}`)
    return 1
  }
  console.log('\n✓ 元件規格每段都有逐家一手來源;其他規格與 tsx 沒有超過棘輪')
  return 0
}

// ── selftest ─────────────────────────────────────────────────────────────────
const SPEC = 'packages/design-system/src/components/Foo/foo.spec.md'
const PATTERN_SPEC = 'packages/design-system/src/patterns/foo/foo.spec.md'
const TSX = 'packages/design-system/src/components/Foo/foo.stories.tsx'

// 判定表:每格兩面(一面該放、一面該擋),同一張表跑共用實作本身與真的 hook
export const JUDGEMENT_TABLE = [
  { cell: '有來源', path: SPEC, text: '# A\n\n對齊 Polaris Banner 的關閉鈕(https://polaris.shopify.com/components/feedback-indicators/banner)。', expect: 'pass' },
  { cell: '沒來源', path: SPEC, text: '# A\n\n對齊 Polaris Banner 的關閉鈕。', expect: 'block', kind: 'no-source' },
  { cell: '來源網域不認', path: SPEC, text: '# A\n\n對齊 Polaris Banner 的關閉鈕(https://blog.example.net/polaris-banner)。', expect: 'block', kind: 'no-source' },
  { cell: 'partial:兩家都有自己的來源', path: SPEC, text: '# A\n\nPolaris(https://polaris.shopify.com/components/feedback-indicators/banner)與 Carbon(https://carbondesignsystem.com/components/notification/usage/)都把關閉鈕放右上。', expect: 'pass' },
  { cell: 'partial:一家有來源、另一家沒有', path: SPEC, text: '# A\n\nPolaris(https://polaris.shopify.com/components/feedback-indicators/banner)與 Carbon 都把關閉鈕放右上。', expect: 'block', kind: 'partial' },
  { cell: 'partial:別家的網址不算這家的來源', path: SPEC, text: '# A\n\nCarbon 也把關閉鈕放右上(https://polaris.shopify.com/components/feedback-indicators/banner)。', expect: 'block', kind: 'partial' },
  { cell: '套件路徑來源(unpkg.com/@scope)', path: SPEC, text: '# A\n\nAtlassian Modal 寬度:unpkg.com/@atlaskit/modal-dialog@17.2.5/dist/es2019/internal/width.js', expect: 'pass' },
  { cell: '套件路徑來源缺', path: SPEC, text: '# A\n\nAtlassian Modal 寬度檔位。', expect: 'block', kind: 'no-source' },
  { cell: 'tsx 範例資料', path: TSX, text: "const OPTIONS = [\n  { value: 'slack', label: 'Slack #general' },\n  { value: 'notion', label: 'Notion 公告頁' },\n]", expect: 'pass' },
  { cell: 'tsx 註解宣稱', path: TSX, text: '// 對齊 Slack 的訊息列\nexport const A = 1', expect: 'block', kind: 'no-source' },
  { cell: 'tsx 網址裡的 :// 不是註解', path: TSX, text: '<a href="https://support.example.com/tickets/88213">Zendesk 客訴 #88213</a>', expect: 'pass' },
  { cell: 'tsx 區塊註解宣稱', path: TSX, text: '{/* Zendesk 的客訴頁也這樣排 */}\n<a href="https://support.example.com/tickets/88213">Zendesk 客訴</a>', expect: 'block', kind: 'no-source' },
  { cell: 'tsx note= 說明文字', path: TSX, text: '<Example note="Material 3 的 chip 也是這樣排" />', expect: 'block', kind: 'no-source' },
  { cell: 'tsx 其他屬性', path: TSX, text: '<Example title="Material 3 chip" />', expect: 'pass' },
  { cell: '程式碼框裡', path: SPEC, text: '# A\n\n```\n[checkbox] [avatar] [name]   ← Notion sharing modal\n```', expect: 'pass' },
  { cell: '程式碼框外', path: SPEC, text: '# A\n\n[checkbox] [avatar] [name] 對齊 Notion sharing modal', expect: 'block', kind: 'no-source' },
  { cell: '撤回標記(其他規格)', path: PATTERN_SPEC, text: '# A\n\n對齊 Atlassian Design <!-- @benchmark-unverified 待補 -->', expect: 'pass' },
  { cell: '撤回標記(元件規格禁)', path: SPEC, text: '# A\n\n對齊 Atlassian Design <!-- @benchmark-unverified 待補 -->', expect: 'block', kind: 'forbidden-marker' },
  { cell: '檔級豁免(tsx)', path: TSX, text: '// @benchmark-unverified-blanket: legacy 待補\n// 對齊 Slack 的訊息列\nexport const A = 1', expect: 'pass' },
  { cell: '檔級豁免(元件規格禁)', path: SPEC, text: '<!-- @benchmark-citation-allow: legacy -->\n# A\n\n對齊 Polaris 派系。', expect: 'block', kind: 'forbidden-marker' },
  { cell: '截圖證據', path: SPEC, text: '# A\n\nLinear 的 sidebar 也這樣收合(snapshots/benchmark/linear-sidebar.png)。', expect: 'pass' },
  { cell: '截圖證據缺', path: SPEC, text: '# A\n\nLinear 的 sidebar 也這樣收合。', expect: 'block', kind: 'no-source' },
  { cell: '撞名:CSS 游標', path: PATTERN_SPEC, text: '# A\n\n- **Cursor**:`col-resize` / `row-resize`', expect: 'pass' },
  { cell: '撞名:產品 Cursor', path: PATTERN_SPEC, text: '# A\n\n代表:Linear(https://linear.app/docs)/ Cursor / VS Code(https://code.visualstudio.com/docs)', expect: 'block', kind: 'partial' },
]

function judgeCell(cell, judge) {
  const result = analyzeText(cell.text, { path: cell.path, judge })
  if (result.status === 'forbidden-marker') return { verdict: 'block', kind: 'forbidden-marker' }
  if (result.status === 'violations') return { verdict: 'block', kind: result.violations[0].kind }
  return { verdict: 'pass', kind: undefined }
}

function hookCell(cell) {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: `/selftest-repo/${cell.path}`, content: cell.text } })
  const run = spawnSync('bash', ['--', join(ROOT, HOOK_PATH)], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, GOVERNANCE_READ_ONLY: '1', GOVERNANCE_TELEMETRY_OPT_IN: '0' },
  })
  if (run.error) return { verdict: `spawn-error:${run.error.message}` }
  return { verdict: run.status === 0 ? 'pass' : run.status === 2 ? 'block' : `exit-${run.status}`, stderr: run.stderr }
}

function writeTree(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

function selftest() {
  const judge = compileJudge()
  const problems = []

  // (A) 判定表:共用實作與 hook 必須同判,而且符合期望
  for (const cell of JUDGEMENT_TABLE) {
    const lib = judgeCell(cell, judge)
    if (lib.verdict !== cell.expect || (cell.kind && lib.kind !== cell.kind)) {
      problems.push(`判定表「${cell.cell}」:實作判 ${lib.verdict}${lib.kind ? `(${lib.kind})` : ''},應為 ${cell.expect}${cell.kind ? `(${cell.kind})` : ''}`)
    }
    const hook = hookCell(cell)
    if (hook.verdict !== cell.expect) {
      problems.push(`判定表「${cell.cell}」:hook 判 ${hook.verdict},應為 ${cell.expect}(hook 與全樹檢查沒有讀同一份判定?)${hook.stderr ? ` —— ${hook.stderr.trim().split('\n').slice(-1)[0]}` : ''}`)
    }
  }
  // 每格兩面:同一個判定主題至少一面放、一面擋(表本身寫壞時這裡先紅)
  const pairs = ['有來源|沒來源', 'partial', '套件路徑來源', 'tsx 範例資料|tsx 註解宣稱', 'tsx 網址裡的 :// 不是註解|tsx 區塊註解宣稱', 'tsx note= 說明文字|tsx 其他屬性', '程式碼框', '撤回標記', '檔級豁免', '截圖證據', '撞名']
  for (const pair of pairs) {
    const pattern = new RegExp(`^(?:${pair.split('|').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
    const expects = new Set(JUDGEMENT_TABLE.filter((cell) => pattern.test(cell.cell)).map((cell) => cell.expect))
    if (!(expects.has('pass') && expects.has('block'))) problems.push(`判定表「${pair}」缺一面(只有 ${[...expects].join(' / ') || '0 格'})`)
  }

  // (B) 合成樹:三類各放一支違規檔 + 一支乾淨檔,外加整檔豁免與範圍外的檔
  const tmp = mkdtempSync(join(tmpdir(), 'benchmark-citation-selftest-'))
  try {
    if (!tmp) throw new Error('mkdtemp returned empty')
    writeTree(tmp, {
      'packages/design-system/src/components/Foo/foo.spec.md': '# Foo\n\n對齊 Polaris Banner 的關閉鈕。\n',
      'packages/design-system/src/components/Foo/clean.spec.md': '# Clean\n\n本 DS 自己的規則。\n',
      'packages/design-system/src/patterns/bar/bar.spec.md': '# Bar\n\nPolaris(https://polaris.shopify.com/x)與 Carbon 都這樣。\n',
      'packages/design-system/src/tokens/clean.spec.md': '# Clean\n',
      'packages/design-system/src/components/Foo/foo.stories.tsx': '// 對齊 Slack 的訊息列\nexport const A = 1\n',
      'packages/design-system/src/components/Foo/foo.tsx': '// @benchmark-unverified-blanket: legacy\n// 對齊 Slack 的訊息列\nexport const B = 1\n',
      'packages/design-system/src/components/Foo/README.md': '對齊 Polaris Banner 的關閉鈕。\n',
      'packages/design-system/src/components/Foo/node_modules/x/x.spec.md': '對齊 Polaris Banner 的關閉鈕。\n',
    })
    const tree = scanTree(tmp, judge)
    const want = { 'component-spec': 2, 'other-spec': 2, tsx: 2 }
    for (const scope of SCOPES) {
      if (tree.filesByScope[scope] !== want[scope]) problems.push(`合成樹:${scope} 掃到 ${tree.filesByScope[scope]} 檔,應為 ${want[scope]}(走訪漏掉一類?)`)
      const flagged = [...new Set(tree.findings.filter((item) => item.scope === scope).map((item) => item.file))]
      if (flagged.length !== 1) problems.push(`合成樹:${scope} 抓到 ${flagged.length} 支違規檔(${flagged.join(', ') || '無'}),應為 1`)
    }
    if (tree.allowlisted.length !== 1) problems.push(`合成樹:整檔豁免應 1 支,實得 ${tree.allowlisted.length}`)
    const partial = tree.findings.find((item) => item.scope === 'other-spec')
    if (!partial || partial.kind !== 'partial' || partial.missing.join() !== 'Carbon') problems.push(`合成樹:其他規格那支應判 partial、缺 Carbon,實得 ${partial ? `${partial.kind}、缺 ${partial.missing.join(' / ')}` : '沒抓到'}`)

    // (C) 棘輪:元件規格不吃棘輪;其他兩類新檔 / 變多紅,持平 / 變少綠
    const other = { file: 'packages/design-system/src/patterns/bar/bar.spec.md', scope: 'other-spec', kind: 'partial', line: 3, missing: ['Carbon'], text: 'x' }
    const comp = { file: 'packages/design-system/src/components/Foo/foo.spec.md', scope: 'component-spec', kind: 'no-source', line: 3, missing: ['Polaris'], text: 'x' }
    const ratchet = [
      ['新檔(不在表上)', [other], {}, 1, 0],
      ['持平', [other], { [other.file]: 1 }, 0, 0],
      ['變多', [other, { ...other, line: 9 }], { [other.file]: 1 }, 1, 0],
      ['變少(提示收緊)', [other], { [other.file]: 2 }, 0, 1],
      ['元件規格不吃棘輪', [comp], { [comp.file]: 1 }, 1, 1],
    ]
    for (const [name, findings, baseline, wantProblems, wantShrunk] of ratchet) {
      const got = evaluate({ findings, markers: [] }, baseline)
      if (got.problems.length !== wantProblems || got.shrunk.length !== wantShrunk) {
        problems.push(`棘輪「${name}」:紅 ${got.problems.length} / 可收緊 ${got.shrunk.length},應為 ${wantProblems} / ${wantShrunk}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  if (problems.length) {
    console.error(`✗ benchmark-citation selftest:${problems.length} 格不符 —— 量具不能當證據`)
    for (const problem of problems) console.error(`  - ${problem}`)
    return 1
  }
  console.log(`✓ benchmark-citation selftest:判定表 ${JUDGEMENT_TABLE.length} 格(${pairs.length} 個主題各兩面)共用實作與真 hook 同判且符合期望;合成樹三類都掃到、各抓到那一支、整檔豁免與範圍外不誤報;棘輪 5 格符合`)
  return 0
}

if (isDirectRun(import.meta.url)) {
  process.exit(process.argv.includes('--selftest') ? selftest() : main())
}
