#!/usr/bin/env node
// Isolated meta-test for scripts/apply-approved-baselines.mjs.  Writes only to a disposable fixture repository.
//
// @gate-contract
//   保證: apply-approved-baselines 只把「user 說了可以改、sha256 與 user 看到的那張相同」的新圖寫進 curated/,
//         任何一項綁定斷掉時整批拒絕且 curated/ 零變動;夾具的審核包由正式的 buildReviewPackage 建出(與 CI 上傳的版面同一份程式)
//   紅: 在隔離 git 夾具裡逐面注入:不認得的檔名 / after sha256 對不上 / 舊圖 sha256 對不上 / 審核包的圖被換過 / 審核後基準被改 /
//       核准沒有變動的圖 / 原話是問句、否定、沒有「可以改」/ 時間沒時區、在未來 / suspicious 沒寫原因 / 量不到的歸因 /
//       拍照後已提交或工作區改了預覽看得見的檔 / 拍照後改了截圖程式 import 鏈上的 scripts/lib 檔(直接與遞移)或 package-lock.json /
//       重複條目 / 空清單 / 一批混一筆壞的 → 每一面都必須拋 ApprovalRefused、指名原因,而且 curated/ 的每一張位元組都與注入前相同;
//       任何一面沒照預期,本測試就紅並指名是哪一面
//   綠: 合格核准(兩張 + 一張 suspicious 附原因)必須只換那三張、讀回 sha256 相等、其餘不動、收據含原話;--dry-run 零寫入;
//       只改治理文件(非預覽可見)或不在截圖程式 import 鏈上的 scripts/lib 檔,後續 commit 不得被誤擋;第二次套用時先前已套用的圖
//       列「已套用」、不列「未核准」;真 repo 的截圖程式範圍由原始碼算出且含 openStory 那一支;全程只寫拋棄式暫存目錄、重複跑結果相同
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { ApprovalRefused, affirmativeApproval, applyApprovedBaselines, captureProgramClosure } from './apply-approved-baselines.mjs'
import { buildReviewPackage, sha256 } from './visual-baseline-review-package.mjs'

const CURATED = 'infra/governance/baseline/visual/curated'
const hermetic = (home) => ({ ...process.env, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', LC_ALL: 'C', GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@example.invalid', GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@example.invalid' })
const png = (paint) => { const p = new PNG({ width: 16, height: 16 }); p.data.fill(255); paint?.(p); return PNG.sync.write(p) }
const ink = (x) => (p) => { p.data[x * 4] = 0 }

const base = realpathSync(mkdtempSync(join(tmpdir(), 'apply-approved-baselines-')))
const faces = []
const tally = { green: 0, red: 0, cli: 0, table: 0 }
const face = (name, fn, kind = 'green') => {
  tally[kind] += 1
  try { fn(); faces.push(`✓ ${name}`) } catch (error) { console.error(`✗ ${name}\n${error.stack}`); process.exitCode = 1 }
}

try {
  const home = join(base, 'home')
  mkdirSync(home)
  const env = hermetic(home)
  const gitIn = (cwd, args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env })
    assert.equal(r.status, 0, `fixture git ${args.join(' ')}:${r.stderr}`)
    return r.stdout.trim()
  }
  const write = (root, rel, bytes) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), bytes) }

  // 已提交基準:a(不變)/ b(要換)/ s(變了但歸因 suspicious)/ d(變了但沒人核准);c 是新增場景
  const committed = { 'a.png': png(), 'b.png': png(ink(1)), 's.png': png(ink(2)), 'd.png': png(ink(3)) }
  const fresh = { 'a.png': committed['a.png'], 'b.png': png(ink(5)), 'c.png': png(ink(6)), 's.png': png(ink(7)), 'd.png': png(ink(8)) }
  const scenarios = ['a', 'b', 'c', 's', 'd'].map((stem) => ({ id: `design-system-components-${stem}--x`, file: `${stem}.png` }))
  const verdicts = { 'a.png': 'identical', 'b.png': 'approved-change-candidate', 'c.png': 'new-scenario', 's.png': 'suspicious', 'd.png': 'approved-change-candidate' }

  // 每一面用一份全新的夾具 repo + 審核包,互不污染
  let counter = 0
  const fixture = ({ verdictOverride = {} } = {}) => {
    const repo = join(base, `repo-${++counter}`)
    mkdirSync(repo)
    gitIn(repo, ['init', '-q'])
    for (const [file, bytes] of Object.entries(committed)) write(repo, `${CURATED}/${file}`, bytes)
    write(repo, 'scripts/visual-assertions.json', `${JSON.stringify({ scenarios })}\n`)
    write(repo, 'packages/design-system/src/components/X/x.tsx', 'export const X = 1\n')
    write(repo, 'governance/notes.md', '# notes\n')
    // 截圖程式:visual-audit.mjs → lib/launch-browser.mjs → lib/storybook-render-health.mjs(遞移);lib/unrelated.mjs 不在鏈上
    write(repo, 'scripts/visual-audit.mjs', "import { openStory } from './lib/launch-browser.mjs'\n// capture v1\n")
    write(repo, 'scripts/lib/launch-browser.mjs', "import { health } from './storybook-render-health.mjs'\nexport const openStory = health\n")
    write(repo, 'scripts/lib/storybook-render-health.mjs', 'export const health = 1\n')
    write(repo, 'scripts/lib/unrelated.mjs', 'export const unrelated = 1\n')
    write(repo, 'package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/playwright":{"version":"1.59.1"}}}\n')
    gitIn(repo, ['add', '-A'])
    gitIn(repo, ['commit', '-q', '-m', 'fixture'])
    const commit = gitIn(repo, ['rev-parse', 'HEAD'])
    const attributionDir = join(base, `attr-${counter}`)
    mkdirSync(attributionDir)
    const report = { oldSource: 'reference', sinceRef: 'f'.repeat(40), counts: {}, scenarios: scenarios.map((s) => ({ file: s.file, id: s.id, verdict: verdictOverride[s.file] ?? verdicts[s.file], componentCommits: [] })) }
    for (const row of report.scenarios) report.counts[row.verdict] = (report.counts[row.verdict] || 0) + 1
    writeFileSync(join(attributionDir, 'report.json'), JSON.stringify(report))
    const packageDir = join(base, `pkg-${counter}`)
    const manifest = buildReviewPackage({
      scenarios,
      readCommitted: (file) => committed[file] ?? null,
      readNew: (file) => fresh[file] ?? null,
      committedFiles: Object.keys(committed),
      attribution: { dir: attributionDir, report },
      source: { repository: 'owner/repo', runId: '1', runAttempt: '1', event: 'push', ref: 'refs/heads/fix/x', commit, referenceRef: 'f'.repeat(40), request: null },
      outDir: packageDir,
      generatedAt: '2026-10-14T00:00:00.000Z',
    })
    return { repo, packageDir, manifest }
  }
  const imageOf = (manifest, file) => manifest.images.find((image) => image.file === file)
  const entry = (manifest, file, patch = {}) => ({
    file,
    reviewedAfterSha256: imageOf(manifest, file).afterSha256,
    reviewedBeforeSha256: imageOf(manifest, file).beforeSha256 ?? null,
    userVerbatim: '這三張可以改',
    approvedAt: '2026-10-14T21:40:00+08:00',
    ...patch,
  })
  const approvals = (...entries) => ({ schemaVersion: 1, kind: 'visual-baseline-approvals', approvals: entries })
  const now = new Date('2026-10-14T14:00:00Z')
  const curatedSnapshot = (repo) => Object.fromEntries(['a.png', 'b.png', 'c.png', 's.png', 'd.png'].map((file) => {
    const path = join(repo, CURATED, file)
    return [file, existsSync(path) ? sha256(readFileSync(path)) : null]
  }))
  const refused = (name, setup, pattern) => face(`拒絕:${name}`, () => {
    const ctx = fixture(setup.fixture)
    setup.mutate?.(ctx)
    const before = curatedSnapshot(ctx.repo)
    let error = null
    try { applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: setup.approvals(ctx.manifest), now }) } catch (caught) { error = caught }
    assert.ok(error instanceof ApprovalRefused, `應拋 ApprovalRefused,得到 ${error ? error.message : '放行'}`)
    assert.match(error.message, pattern)
    assert.deepEqual(curatedSnapshot(ctx.repo), before, 'curated/ 必須一個位元組都不動')
  }, 'red')

  // ── 綠:合格核准只換被核准的那幾張 ──────────────────────────────────────────
  face('合格:b(changed)+ c(added)+ s(suspicious 附原因)→ 只換這三張、讀回相等、a / d 不動、收據含原話', () => {
    const ctx = fixture()
    const before = curatedSnapshot(ctx.repo)
    const result = applyApprovedBaselines({
      repoRoot: ctx.repo,
      packageDir: ctx.packageDir,
      approvals: approvals(entry(ctx.manifest, 'b.png'), entry(ctx.manifest, 'c.png'), entry(ctx.manifest, 's.png', { attributionCause: '共用層 tokens 改了 --layout-space(commit abcdef12)' })),
      now,
    })
    const after = curatedSnapshot(ctx.repo)
    assert.equal(after['b.png'], sha256(fresh['b.png']))
    assert.equal(after['c.png'], sha256(fresh['c.png']))
    assert.equal(after['s.png'], sha256(fresh['s.png']))
    assert.equal(after['a.png'], before['a.png'])
    assert.equal(after['d.png'], before['d.png'], '沒被核准的 d 不得被換')
    const receipt = JSON.parse(readFileSync(result.receiptPath, 'utf8'))
    assert.deepEqual(receipt.applied.map((row) => row.file), ['b.png', 'c.png', 's.png'])
    assert.equal(receipt.applied[0].userVerbatim, '這三張可以改')
    assert.deepEqual(receipt.notApproved, ['d.png'])
    assert.deepEqual(receipt.alreadyApplied, [])
    assert.equal('untouched' in receipt, false, '收據不得再用「不在這次計畫裡」一概當成沒核准')
    assert.ok(result.receiptPath.includes(`${join('.git', 'governance-runtime', 'evidence', 'visual', 'baseline-apply')}`), `收據應寫在 .git/governance-runtime/evidence/visual/baseline-apply:${result.receiptPath}`)
  })
  face('合格:--dry-run 只回傳計畫,零寫入', () => {
    const ctx = fixture()
    const before = curatedSnapshot(ctx.repo)
    const result = applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'b.png')), dryRun: true, now })
    assert.equal(result.plan.length, 1)
    assert.equal(result.receiptPath, null)
    assert.deepEqual(curatedSnapshot(ctx.repo), before)
  })
  face('合格:拍照後只改治理文件(預覽看不見)不得被誤擋', () => {
    const ctx = fixture()
    write(ctx.repo, 'governance/notes.md', '# notes v2\n')
    gitIn(ctx.repo, ['commit', '-q', '-am', 'docs'])
    applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'b.png')), now })
    assert.equal(curatedSnapshot(ctx.repo)['b.png'], sha256(fresh['b.png']))
  })
  face('合格:拍照後改了不在截圖程式 import 鏈上的 scripts/lib 檔,不得被誤擋(範圍是算出來的鏈,不是整個 lib/)', () => {
    const ctx = fixture()
    write(ctx.repo, 'scripts/lib/unrelated.mjs', 'export const unrelated = 2\n')
    gitIn(ctx.repo, ['commit', '-q', '-am', 'unrelated lib'])
    applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'b.png')), now })
    assert.equal(curatedSnapshot(ctx.repo)['b.png'], sha256(fresh['b.png']))
  })
  face('合格:第二次套用 —— 先前已套用的圖列「已套用」,其餘才列「未核准」', () => {
    const ctx = fixture()
    applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'b.png')), now })
    gitIn(ctx.repo, ['commit', '-q', '-am', 'apply b'])
    const second = applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'c.png')), now: new Date(now.getTime() + 1000) })
    assert.deepEqual(second.receipt.applied.map((row) => row.file), ['c.png'])
    assert.deepEqual(second.receipt.alreadyApplied, ['b.png'], '先前已套用的 b 必須列「已套用」')
    assert.deepEqual(second.receipt.notApproved, ['s.png', 'd.png'], '只有還是舊圖的才列「未核准」')
    // 對已套用的圖再送一次核准:指名「已經套用過了」,不是含糊的「審核之後被改過」
    let error = null
    try { applyApprovedBaselines({ repoRoot: ctx.repo, packageDir: ctx.packageDir, approvals: approvals(entry(ctx.manifest, 'b.png')), now }) } catch (caught) { error = caught }
    assert.ok(error instanceof ApprovalRefused)
    assert.match(error.message, /已經套用過了/)
  })
  face('截圖程式範圍由原始碼算出:真 repo 的 visual-audit.mjs 鏈含 openStory 那一支與其他會載入的 lib', () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
    const { files, missing } = captureProgramClosure((path) => { try { return readFileSync(join(repoRoot, path), 'utf8') } catch { return null } })
    assert.deepEqual(missing, [], `visual-audit.mjs 的 import 讀不到:${missing.join(', ')}`)
    for (const required of ['scripts/visual-audit.mjs', 'scripts/lib/launch-browser.mjs', 'scripts/lib/storybook-render-health.mjs', 'scripts/lib/a11y-static-server.mjs', 'scripts/lib/governance-visual-baselines.mjs', 'scripts/lib/governance-runtime-evidence.mjs']) {
      assert.ok(files.includes(required), `截圖程式範圍漏了 ${required}:${files.join(', ')}`)
    }
    assert.ok(files.every((file) => file === 'scripts/visual-audit.mjs' || /^scripts\/lib\/.+\.mjs$/.test(file)), `範圍只能是 visual-audit.mjs 與 scripts/lib:${files.join(', ')}`)
  })

  // ── 紅:每一面都整批拒絕、curated/ 零變動 ────────────────────────────────────
  refused('不認得的檔名', { approvals: (m) => approvals({ ...entry(m, 'b.png'), file: 'nope.png' }) }, /審核包裡沒有這張圖/)
  refused('核准的 after sha256 不是審核包那張', { approvals: (m) => approvals(entry(m, 'b.png', { reviewedAfterSha256: sha256(Buffer.from('other')) })) }, /核准綁的是 user 看到的那張/)
  refused('核准的舊圖 sha256 對不上', { approvals: (m) => approvals(entry(m, 'b.png', { reviewedBeforeSha256: sha256(Buffer.from('other')) })) }, /user 看到的舊圖/)
  refused('審核包下載後被換過', { mutate: (ctx) => writeFileSync(join(ctx.packageDir, 'new', 'b.png'), png(ink(9))), approvals: (m) => approvals(entry(m, 'b.png')) }, /被換過或損毀/)
  refused('審核後已提交基準被改', { mutate: (ctx) => { write(ctx.repo, `${CURATED}/b.png`, png(ink(10))); gitIn(ctx.repo, ['commit', '-q', '-am', 'rebake elsewhere']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /審核之後被改過/)
  refused('核准一張沒有變動的圖', { approvals: (m) => approvals({ ...entry(m, 'b.png'), file: 'a.png', reviewedAfterSha256: imageOf(m, 'a.png').afterSha256, reviewedBeforeSha256: imageOf(m, 'a.png').beforeSha256 }) }, /是 unchanged,沒有東西可核准/)
  refused('原話是問句', { approvals: (m) => approvals(entry(m, 'b.png', { userVerbatim: '這張可以改嗎?' })) }, /問句/)
  refused('原話是否定', { approvals: (m) => approvals(entry(m, 'b.png', { userVerbatim: '這張不可以改' })) }, /否定/)
  refused('原話沒有「可以改」', { approvals: (m) => approvals(entry(m, 'b.png', { userVerbatim: '看起來還行' })) }, /沒有「可以改」/)
  refused('時間沒有時區', { approvals: (m) => approvals(entry(m, 'b.png', { approvedAt: '2026-10-14T21:40:00' })) }, /帶時區/)
  refused('時間在未來', { approvals: (m) => approvals(entry(m, 'b.png', { approvedAt: '2026-10-15T21:40:00+08:00' })) }, /在未來/)
  refused('suspicious 沒寫原因', { approvals: (m) => approvals(entry(m, 's.png')) }, /attributionCause 必須寫出/)
  refused('歸因量不到(dimension-mismatch)', { fixture: { verdictOverride: { 'b.png': 'dimension-mismatch' } }, approvals: (m) => approvals(entry(m, 'b.png', { attributionCause: '理由寫再多也不收,量不到就是量不到' })) }, /量不到/)
  refused('拍照後已提交預覽看得見的改動', { mutate: (ctx) => { write(ctx.repo, 'packages/design-system/src/components/X/x.tsx', 'export const X = 2\n'); gitIn(ctx.repo, ['commit', '-q', '-am', 'change ui']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /決定畫面的檔已提交了變動.*x\.tsx/)
  refused('工作區有未提交、預覽看得見的改動', { mutate: (ctx) => write(ctx.repo, 'packages/design-system/src/components/X/x.tsx', 'export const X = 3\n'), approvals: (m) => approvals(entry(m, 'b.png')) }, /工作區有未提交.*x\.tsx/)
  refused('場景清單在拍照後被改', { mutate: (ctx) => { write(ctx.repo, 'scripts/visual-assertions.json', '{"scenarios":[]}\n'); gitIn(ctx.repo, ['commit', '-q', '-am', 'scenarios']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /visual-assertions\.json/)
  refused('截圖程式在拍照後被改', { mutate: (ctx) => { write(ctx.repo, 'scripts/visual-audit.mjs', '// capture v2\n'); gitIn(ctx.repo, ['commit', '-q', '-am', 'capture']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /visual-audit\.mjs/)
  refused('拍照後提交 scripts/lib/launch-browser.mjs(截圖程式直接 import)', { mutate: (ctx) => { write(ctx.repo, 'scripts/lib/launch-browser.mjs', "import { health } from './storybook-render-health.mjs'\nexport const openStory = health + 1\n"); gitIn(ctx.repo, ['commit', '-q', '-am', 'settle frames']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /決定畫面的檔已提交了變動.*launch-browser\.mjs/)
  refused('拍照後提交遞移 import 的 scripts/lib/storybook-render-health.mjs', { mutate: (ctx) => { write(ctx.repo, 'scripts/lib/storybook-render-health.mjs', 'export const health = 2\n'); gitIn(ctx.repo, ['commit', '-q', '-am', 'health']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /storybook-render-health\.mjs/)
  refused('拍照後改了 package-lock.json(依賴版本)', { mutate: (ctx) => { write(ctx.repo, 'package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/playwright":{"version":"1.60.0"}}}\n'); gitIn(ctx.repo, ['commit', '-q', '-am', 'bump']) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /package-lock\.json/)
  refused('同一張出現兩次', { approvals: (m) => approvals(entry(m, 'b.png'), entry(m, 'b.png')) }, /出現兩次/)
  refused('空清單(0 筆不是全部通過)', { approvals: () => approvals() }, /核准清單是空的/)
  refused('條目多一個不認得的欄位', { approvals: (m) => approvals(entry(m, 'b.png', { force: true })) }, /不認得的欄位:force/)
  refused('一批裡混一筆壞的 → 好的那筆也不寫', { approvals: (m) => approvals(entry(m, 'b.png'), entry(m, 'c.png', { userVerbatim: '可以改嗎' })) }, /第 2 筆.*問句/)
  refused('拍照的 commit 不在本地', { mutate: (ctx) => { const manifestPath = join(ctx.packageDir, 'manifest.json'); const m = JSON.parse(readFileSync(manifestPath, 'utf8')); m.source.commit = '0'.repeat(40); writeFileSync(manifestPath, JSON.stringify(m)) }, approvals: (m) => approvals(entry(m, 'b.png')) }, /不在本地 repo/)

  // ── CLI 真的會跑(被 import 時不跑的守衛若失效,CLI 會靜默 exit 0 —— 那是假綠)────────────────
  face('CLI:以路徑呼叫時真的執行,缺檔 → exit 1 並指名', () => {
    const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'apply-approved-baselines.mjs'), '--package', join(base, 'nope'), '--approvals', join(base, 'nope.json')], { encoding: 'utf8' })
    assert.equal(r.status, 1, `CLI 應 exit 1,得到 ${r.status}:${r.stdout}${r.stderr}`)
    assert.match(r.stderr, /核准清單 不在/)
  }, 'cli')

  // ── 原話判準的判定表(同一張表兩面:肯定的放行、問句 / 否定的擋下)────────────────
  face('原話判準:肯定放行、問句 / 否定 / A-不-A 擋下', () => {
    for (const ok of ['可以改', '這三張可以改', '不錯,可以改', '1、3 可以改,2 不可以改', '可以改。', '可以改,你為什麼還沒改?']) assert.equal(affirmativeApproval(ok).ok, true, ok)
    for (const no of ['可以改嗎?', '這些都可以改?', '可以改了吧?', '不可以改', '可不可以改', '我不覺得可以改', '沒說可以改', '', 'OK 換吧']) assert.equal(affirmativeApproval(no).ok, false, no)
  }, 'table')
} finally {
  rmSync(base, { recursive: true, force: true })
}

for (const line of faces) console.log(line)
if (process.exitCode) console.error('✗ apply-approved-baselines meta-test 有面沒照預期')
else console.log(`✓ apply-approved-baselines meta-test:${faces.length} 面全照預期(綠 ${tally.green} 面 / 紅 ${tally.red} 面 / CLI ${tally.cli} 面 / 原話判定表 ${tally.table} 面)`)
