#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 重拍後交給 user 逐張拍板的審核包,對每一則精選場景都列出它相對**已提交基準**(git HEAD 的那張)的狀態
 *        (unchanged / pixel-identical / changed / added),每張 changed / added 都附 before / after / diff 與前後 sha256,
 *        而且 manifest 寫的 afterSha256 就是 new/ 與 changes/ 裡那張圖的位元組 —— user 看到的圖就是之後會被套用的圖
 *   紅: --selftest:像素相同但位元組不同 → 必判 pixel-identical(不送審);改一個像素 → 必判 changed 且 exactChangedPixels = 1;
 *       尺寸不同 → changed 且沒有 diff 圖;沒有舊圖 → added;任一則場景的新圖不在、歸因報告缺這一張、輸出目錄不是空的
 *       → 整包拒絕(throw / exit 1),不得產出缺張的審核包
 *   綠: 兩張位元組相同 → unchanged;判定只比解碼後的 RGBA 逐像素(不抽樣、不看時間),selftest 對同一組輸入建兩次包,
 *       除 generatedAt 外 manifest 逐位元組相同
 *
 * 視覺基準重拍的**審核包**(2026-10-14,待辦總帳 R3)。
 *
 * visual-baseline-diff-report.mjs 回答「為什麼變」(參考 commit 與 HEAD 在同一個容器重拍、逐張歸因到 commit);
 * 這支回答「換下去會變哪幾張」—— user 拍板的對象是**已提交的基準 → 新圖**,所以 before 一律是 git HEAD 裡那張,
 * 不是參考 commit 重拍的那張。兩份結論在 manifest 裡逐張並排(attribution 欄)。
 *
 * 審核包版面(= Visual Regression 上傳的 artifact `visual-baselines-recaptured` 根目錄):
 *   README.md                     人看的:版面說明 + 變動清單
 *   manifest.json                 機器讀的:每則場景的狀態、前後 sha256、尺寸、變動像素、歸因
 *   new/<檔名>.png                 這次在釘死容器重拍的**全部**精選圖(= 重拍後 curated/ 的完整複本)
 *   changes/<主檔名>/before.png    已提交的基準(git HEAD);新增場景沒有這張
 *   changes/<主檔名>/after.png     新圖(與 new/<檔名>.png 位元組相同)
 *   changes/<主檔名>/diff.png      逐像素差異(紅 = 有變,含反鋸齒像素);尺寸不同時沒有這張
 *   attribution/                   visual-baseline-diff-report.mjs 的輸出原樣(report.json / summary.md / *.diff.png)
 * 只有 changed / added 會進 changes/ 並可被核准;unchanged 與 pixel-identical(位元組不同、像素全同)不需要換。
 *
 * 套用:scripts/apply-approved-baselines.mjs(只換 user 逐張說「可以改」、且 sha256 對得上的那幾張)。
 *
 * 用法(workflow 內,重拍 + 歸因之後):
 *   node scripts/visual-baseline-review-package.mjs --attribution <歸因輸出目錄> --out <審核包目錄>
 *   node scripts/visual-baseline-review-package.mjs --selftest
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { runClosedGit } from '../packages/governance/src/closed-tool-execution.mjs'
import { BLOCKING_VERDICTS, PIXEL_DIFF_PCT_BUDGET, classifyDiff } from './visual-baseline-diff-report.mjs'
import { REBAKE_REQUEST_PATH, readRebakeRequest } from './visual-rebake-request.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const REVIEW_PACKAGE_KIND = 'visual-baseline-review-package'
export const REVIEW_PACKAGE_SCHEMA_VERSION = 1
export const CURATED_DIR = 'infra/governance/baseline/visual/curated'
/** 只有這兩種狀態會進 changes/、可以被核准;其餘(unchanged / pixel-identical)不需要換。 */
export const APPROVABLE_STATUSES = Object.freeze(['changed', 'added'])
/** 歸因分類裡「原因查出來並記下來才可接受」的那兩種(其餘 blocking 是量不到,永遠不可接受)。SSOT 是 BLOCKING_VERDICTS。 */
export const NEEDS_CAUSE_VERDICTS = Object.freeze(['suspicious', 'unmapped'])
export { BLOCKING_VERDICTS }

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const reviewStem = (file) => file.replace(/\.png$/i, '')
const round3 = (value) => Number(value.toFixed(3))

class ReviewPackageError extends Error {}
const fail = (message) => { throw new ReviewPackageError(`✗ INSTRUMENT-FAIL(審核包):${message}`) }

/** 安全的平面檔名(場景檔名一律是 curated/ 下的一層 .png)。 */
function assertFlatPng(file) {
  if (typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(file)) fail(`場景檔名不是 curated/ 下一層的 .png:${JSON.stringify(file)}`)
  return file
}

/**
 * 純函式:已提交基準(可為 null)→ 新圖。
 * 狀態只看位元組與解碼後的 RGBA,不用 pixelmatch 的感知門檻判「有沒有變」—— 感知門檻 0.1 會把小色差當成沒變,
 * 而審核包要回答的是「換下去 repo 裡的圖會不會變」。感知差異%(visual-audit 同一個 0.5% 預算)只當參考欄位。
 */
export function compareToCommitted(beforeBytes, afterBytes) {
  const afterSha256 = sha256(afterBytes)
  const after = PNG.sync.read(afterBytes)
  const afterSize = { width: after.width, height: after.height }
  const empty = { exactChangedPixels: null, exactChangedPct: null, perceptualPct: null, perceptualVerdict: null, diffPng: null }
  if (!beforeBytes) return { status: 'added', beforeSha256: null, afterSha256, before: null, after: afterSize, ...empty }
  const beforeSha256 = sha256(beforeBytes)
  const before = PNG.sync.read(beforeBytes)
  const beforeSize = { width: before.width, height: before.height }
  const base = { beforeSha256, afterSha256, before: beforeSize, after: afterSize }
  if (beforeSha256 === afterSha256) {
    return { status: 'unchanged', ...base, exactChangedPixels: 0, exactChangedPct: 0, perceptualPct: 0, perceptualVerdict: 'identical', diffPng: null }
  }
  if (before.width !== after.width || before.height !== after.height) {
    return { status: 'changed', dimensionChange: true, ...base, ...empty }
  }
  let exact = 0
  for (let i = 0; i < before.data.length; i += 4) {
    if (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2] || before.data[i + 3] !== after.data[i + 3]) exact += 1
  }
  const total = before.width * before.height
  if (exact === 0) {
    return { status: 'pixel-identical', ...base, exactChangedPixels: 0, exactChangedPct: 0, perceptualPct: 0, perceptualVerdict: 'identical', diffPng: null }
  }
  const perceptual = classifyDiff(before, after)
  const diff = new PNG({ width: before.width, height: before.height })
  pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0, includeAA: true })
  return {
    status: 'changed',
    ...base,
    exactChangedPixels: exact,
    exactChangedPct: round3((exact / total) * 100),
    perceptualPct: perceptual.pct,
    perceptualVerdict: perceptual.verdict,
    diffPng: PNG.sync.write(diff),
  }
}

function assertEmptyOrAbsent(dir) {
  if (!existsSync(dir)) return
  if (!statSync(dir).isDirectory()) fail(`輸出位置不是目錄:${dir}`)
  if (readdirSync(dir).length) fail(`輸出目錄不是空的:${dir}(舊包與新包混在一起,user 看到的就不是這次的圖)`)
}

/**
 * 建包(CLI 與 meta-test 共用同一份,所以 apply 的測試吃的就是真正會上傳的版面)。
 * readCommitted(file) → Buffer | null(git HEAD 沒有這張 = null);readNew(file) → Buffer | null。
 * attribution = { dir, report }:visual-baseline-diff-report.mjs 的輸出目錄與其 report.json 內容。
 */
export function buildReviewPackage({ scenarios, readCommitted, readNew, committedFiles, attribution, source, outDir, generatedAt = new Date().toISOString() }) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) fail('場景清單是空的(scripts/visual-assertions.json 讀不到場景 —— 0 則不是「沒有變動」)')
  const files = scenarios.map((scenario) => assertFlatPng(scenario.file))
  const duplicated = files.filter((file, index) => files.indexOf(file) !== index)
  if (duplicated.length) fail(`同一個檔名被多則場景使用:${[...new Set(duplicated)].join(', ')}`)
  if (!attribution?.report || !Array.isArray(attribution.report.scenarios)) fail('歸因報告(attribution/report.json)讀不到 —— 沒有歸因的審核包不得產出')
  const attributionByFile = new Map(attribution.report.scenarios.map((row) => [row.file, row]))
  const missingNew = files.filter((file) => !readNew(file))
  if (missingNew.length) fail(`${missingNew.length} 則場景沒有新圖(重拍失敗?):${missingNew.join(', ')}`)
  const missingAttribution = files.filter((file) => !attributionByFile.has(file))
  if (missingAttribution.length) fail(`歸因報告缺 ${missingAttribution.length} 張:${missingAttribution.join(', ')}`)

  assertEmptyOrAbsent(outDir)
  // 先寫進同層的暫存目錄、全部寫完才換名成 outDir:中途任何一張解碼失敗,都不會留下缺張的審核包
  const finalDir = outDir
  mkdirSync(dirname(finalDir), { recursive: true })
  const stagingDir = mkdtempSync(`${finalDir}.partial-`)
  try {
    const manifest = writeReviewPackage({ scenarios, readCommitted, readNew, committedFiles, attribution, attributionByFile, files, source, outDir: stagingDir, generatedAt })
    if (existsSync(finalDir)) rmdirSync(finalDir)
    renameSync(stagingDir, finalDir)
    return manifest
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }
}

function writeReviewPackage({ scenarios, readCommitted, readNew, committedFiles, attribution, attributionByFile, files, source, outDir, generatedAt }) {
  mkdirSync(join(outDir, 'new'), { recursive: true })
  mkdirSync(join(outDir, 'changes'), { recursive: true })
  const images = []
  for (const scenario of scenarios) {
    const file = scenario.file
    const afterBytes = readNew(file)
    const beforeBytes = readCommitted(file)
    const cmp = compareToCommitted(beforeBytes, afterBytes)
    writeFileSync(join(outDir, 'new', file), afterBytes)
    let review = null
    if (APPROVABLE_STATUSES.includes(cmp.status)) {
      const dir = join('changes', reviewStem(file))
      mkdirSync(join(outDir, dir), { recursive: true })
      writeFileSync(join(outDir, dir, 'after.png'), afterBytes)
      if (beforeBytes) writeFileSync(join(outDir, dir, 'before.png'), beforeBytes)
      if (cmp.diffPng) writeFileSync(join(outDir, dir, 'diff.png'), cmp.diffPng)
      review = {
        before: beforeBytes ? `${dir}/before.png` : null,
        after: `${dir}/after.png`,
        diff: cmp.diffPng ? `${dir}/diff.png` : null,
      }
    }
    const a = attributionByFile.get(file)
    const { diffPng: _diffPng, ...row } = cmp
    images.push({
      file,
      id: scenario.id ?? null,
      ...row,
      review,
      attribution: {
        verdict: a.verdict,
        pct: a.pct ?? null,
        componentDir: a.componentDir ?? null,
        componentCommits: a.componentCommits ?? [],
        sharedLayerCommits: a.sharedLayerCommits ?? [],
        note: a.note ?? null,
      },
    })
  }
  if (attribution.dir) {
    mkdirSync(join(outDir, 'attribution'), { recursive: true })
    for (const name of readdirSync(attribution.dir).sort()) {
      const from = join(attribution.dir, name)
      if (statSync(from).isFile()) copyFileSync(from, join(outDir, 'attribution', name))
    }
  }
  const scenarioFiles = new Set(files)
  const orphans = (committedFiles || []).filter((file) => !scenarioFiles.has(file)).sort()
  const counts = images.reduce((acc, image) => { acc[image.status] = (acc[image.status] || 0) + 1; return acc }, {})
  const attributionCounts = attribution.report.counts || {}
  const manifest = {
    schemaVersion: REVIEW_PACKAGE_SCHEMA_VERSION,
    kind: REVIEW_PACKAGE_KIND,
    generatedAt,
    source,
    budgetPct: PIXEL_DIFF_PCT_BUDGET,
    counts,
    approvable: images.filter((image) => APPROVABLE_STATUSES.includes(image.status)).map((image) => image.file),
    attribution: {
      oldSource: attribution.report.oldSource ?? null,
      sinceRef: attribution.report.sinceRef ?? null,
      counts: attributionCounts,
      blocking: BLOCKING_VERDICTS.reduce((sum, verdict) => sum + (attributionCounts[verdict] || 0), 0),
    },
    images,
    orphans,
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(outDir, 'README.md'), renderReadme(manifest))
  return manifest
}

function renderReadme(manifest) {
  const approvable = manifest.images.filter((image) => APPROVABLE_STATUSES.includes(image.status))
  const src = manifest.source || {}
  const lines = [
    '# 視覺基準重拍審核包',
    '',
    `拍的樹:\`${src.commit ?? '?'}\`(${src.event ?? '?'} ${src.ref ?? ''});歸因參考:\`${manifest.attribution.sinceRef ?? '?'}\`;run ${src.runId ?? '?'}#${src.runAttempt ?? '?'}`,
    src.request ? `重拍請求:${src.request.reason}(${src.request.requestedAt})` : '',
    '',
    `統計(相對已提交基準):${Object.entries(manifest.counts).map(([k, v]) => `${k} ${v}`).join(' / ')};歸因不得直接接受的 ${manifest.attribution.blocking} 張`,
    '',
    '## 版面',
    '',
    '- `manifest.json`:每則場景的狀態、前後 sha256、尺寸、變動像素、歸因(機器讀)',
    '- `new/<檔名>.png`:這次重拍的全部精選圖',
    '- `changes/<主檔名>/before.png`:已提交的基準(新增場景沒有)',
    '- `changes/<主檔名>/after.png`:新圖(與 `new/` 那張位元組相同)',
    '- `changes/<主檔名>/diff.png`:逐像素差異(紅 = 有變;尺寸不同時沒有)',
    '- `attribution/`:同渲染器歸因(參考 commit 重拍 vs 這次重拍;`scripts/visual-baseline-diff-report.mjs`)',
    '',
    '只有下表的圖可以被核准;核准綁的是 after 的 sha256(user 看到的那張),套用用 `scripts/apply-approved-baselines.mjs`。',
    '',
    '| 狀態 | 圖 | 變動像素(%) | 感知差異% | 歸因 | after sha256 |',
    '|---|---|---|---|---|---|',
    ...approvable.map((image) => `| ${image.status}${image.dimensionChange ? '(尺寸變)' : ''} | ${image.file} | ${image.exactChangedPixels ?? '-'}(${image.exactChangedPct ?? '-'}) | ${image.perceptualPct ?? '-'} | ${image.attribution.verdict}${image.attribution.componentCommits.length ? ` ${image.attribution.componentCommits.map((c) => `\`${c.slice(0, 8)}\``).join(' ')}` : ''} | \`${image.afterSha256.slice(0, 12)}…\` |`),
    '',
    manifest.orphans.length ? `已提交但沒有任何場景指到的基準(只列出,不會被動):${manifest.orphans.join(', ')}` : '',
    '',
  ]
  return `${lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')}\n`
}

function closedGit(args, output) {
  const result = runClosedGit(args, { cwd: ROOT, output, maxOutputBytes: 64 * 1024 * 1024, timeoutMs: 30_000 })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`git ${args.join(' ')} 失敗(exit ${String(result.status)}):${String(result.stderr || '').trim().split('\n')[0]}`)
  return result.stdout
}

function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'review-package-selftest-'))
  try {
    const png = (w, h, paint) => { const p = new PNG({ width: w, height: h }); p.data.fill(255); paint?.(p); return PNG.sync.write(p) }
    const base = png(20, 20)
    // 同像素、不同位元組:用不壓縮(deflateLevel 0)重新編碼(實測 deflateLevel 1 對純白圖產出相同位元組 —— 對照組當場抓到)
    const sameDifferentBytes = PNG.sync.write(PNG.sync.read(base), { deflateLevel: 0 })
    if (sha256(sameDifferentBytes) === sha256(base)) throw new Error('selftest 對照組失效:重新編碼後位元組仍相同,pixel-identical 這一面沒被測到')
    const onePixel = png(20, 20, (p) => { p.data[0] = 0 })
    const cases = [
      ['位元組相同 → unchanged', base, base, 'unchanged'],
      ['像素相同、位元組不同 → pixel-identical(不送審)', base, sameDifferentBytes, 'pixel-identical'],
      ['改一個像素 → changed', base, onePixel, 'changed'],
      ['尺寸不同 → changed(沒有 diff 圖)', base, png(21, 20), 'changed'],
      ['沒有舊圖 → added', null, base, 'added'],
    ]
    for (const [why, before, after, want] of cases) {
      const got = compareToCommitted(before, after)
      if (got.status !== want) throw new Error(`selftest:${why},得到 ${got.status}`)
    }
    const one = compareToCommitted(base, onePixel)
    if (one.exactChangedPixels !== 1 || !one.diffPng) throw new Error(`selftest:改一個像素應 exactChangedPixels=1 且有 diff 圖,得到 ${one.exactChangedPixels}`)
    if (one.perceptualVerdict !== 'within-budget') throw new Error(`selftest:1/400 像素應落在感知預算內(within-budget),得到 ${one.perceptualVerdict}`)
    if (compareToCommitted(base, png(21, 20)).diffPng !== null) throw new Error('selftest:尺寸不同不應有 diff 圖')

    // 建包:四則場景(不變 / 改一像素 / 新增 / 像素同位元組不同)
    const scenarios = [{ id: 'a--x', file: 'a.png' }, { id: 'b--x', file: 'b.png' }, { id: 'c--x', file: 'c.png' }, { id: 'd--x', file: 'd.png' }]
    const committed = { 'a.png': base, 'b.png': base, 'd.png': base, 'orphan.png': base }
    const fresh = { 'a.png': base, 'b.png': onePixel, 'c.png': base, 'd.png': sameDifferentBytes }
    const attributionDir = join(tmp, 'attr')
    mkdirSync(attributionDir)
    const report = { oldSource: 'ref', sinceRef: 'f'.repeat(40), counts: { identical: 2, 'approved-change-candidate': 1, 'new-scenario': 1 }, scenarios: scenarios.map((s) => ({ file: s.file, id: s.id, verdict: s.file === 'b.png' ? 'approved-change-candidate' : s.file === 'c.png' ? 'new-scenario' : 'identical', componentCommits: s.file === 'b.png' ? ['abcdef12 fix'] : [] })) }
    writeFileSync(join(attributionDir, 'report.json'), JSON.stringify(report))
    const args = (out, overrides = {}) => ({ scenarios, readCommitted: (f) => committed[f] ?? null, readNew: (f) => fresh[f] ?? null, committedFiles: Object.keys(committed), attribution: { dir: attributionDir, report }, source: { commit: 'e'.repeat(40) }, outDir: out, generatedAt: '2026-10-14T00:00:00.000Z', ...overrides })
    const out1 = join(tmp, 'pkg1')
    const manifest = buildReviewPackage(args(out1))
    const statusOf = Object.fromEntries(manifest.images.map((image) => [image.file, image.status]))
    if (JSON.stringify(statusOf) !== JSON.stringify({ 'a.png': 'unchanged', 'b.png': 'changed', 'c.png': 'added', 'd.png': 'pixel-identical' })) throw new Error(`selftest:建包狀態不對 ${JSON.stringify(statusOf)}`)
    if (JSON.stringify(manifest.approvable) !== JSON.stringify(['b.png', 'c.png'])) throw new Error(`selftest:可核准清單應只有 b、c,得到 ${manifest.approvable}`)
    for (const rel of ['new/a.png', 'new/b.png', 'new/c.png', 'new/d.png', 'changes/b/before.png', 'changes/b/after.png', 'changes/b/diff.png', 'changes/c/after.png', 'attribution/report.json', 'manifest.json', 'README.md']) {
      if (!existsSync(join(out1, rel))) throw new Error(`selftest:審核包缺 ${rel}`)
    }
    for (const rel of ['changes/a', 'changes/d', 'changes/c/before.png', 'changes/c/diff.png']) {
      if (existsSync(join(out1, rel))) throw new Error(`selftest:審核包不該有 ${rel}`)
    }
    const b = manifest.images.find((image) => image.file === 'b.png')
    if (sha256(readFileSync(join(out1, 'changes/b/after.png'))) !== b.afterSha256 || sha256(readFileSync(join(out1, 'new/b.png'))) !== b.afterSha256) throw new Error('selftest:manifest 的 afterSha256 與包裡的圖不同')
    if (JSON.stringify(manifest.orphans) !== JSON.stringify(['orphan.png'])) throw new Error('selftest:沒有場景指到的已提交基準應列為 orphan')
    // 決定性:同一組輸入再建一次,manifest 逐位元組相同
    const out2 = join(tmp, 'pkg2')
    buildReviewPackage(args(out2))
    if (readFileSync(join(out1, 'manifest.json'), 'utf8') !== readFileSync(join(out2, 'manifest.json'), 'utf8')) throw new Error('selftest:同一組輸入兩次建包的 manifest 不同')
    // 拒絕面
    const refuse = (why, run, pattern) => {
      let message = null
      try { run() } catch (error) { message = error.message }
      if (!message) throw new Error(`selftest:${why} 應拒絕,卻產出了審核包`)
      if (!pattern.test(message)) throw new Error(`selftest:${why} 的錯誤沒指名:${message}`)
    }
    refuse('新圖缺一張', () => buildReviewPackage(args(join(tmp, 'pkg3'), { readNew: (f) => (f === 'c.png' ? null : fresh[f]) })), /沒有新圖.*c\.png/)
    refuse('歸因報告缺一張', () => buildReviewPackage(args(join(tmp, 'pkg4'), { attribution: { dir: attributionDir, report: { ...report, scenarios: report.scenarios.slice(1) } } })), /歸因報告缺 1 張:a\.png/)
    refuse('輸出目錄不是空的', () => buildReviewPackage(args(out1)), /不是空的/)
    refuse('場景清單是空的', () => buildReviewPackage(args(join(tmp, 'pkg5'), { scenarios: [] })), /0 則/)
    refuse('場景檔名帶路徑', () => buildReviewPackage(args(join(tmp, 'pkg6'), { scenarios: [{ id: 'x', file: '../x.png' }] })), /一層的 \.png/)
    if (existsSync(join(tmp, 'pkg3')) || existsSync(join(tmp, 'pkg4'))) throw new Error('selftest:被拒絕的包不得留下任何目錄')
    // 寫到一半才壞(新圖不是 PNG)→ 不得留下缺張的包,也不得留下暫存目錄
    refuse('寫到一半新圖解碼失敗', () => buildReviewPackage(args(join(tmp, 'pkg7'), { readNew: (f) => (f === 'd.png' ? Buffer.from('not a png') : fresh[f]) })), /./)
    if (readdirSync(tmp).some((name) => name.startsWith('pkg7'))) throw new Error(`selftest:寫到一半失敗留下了 ${readdirSync(tmp).filter((n) => n.startsWith('pkg7'))}`)
    console.log('✓ visual-baseline-review-package selftest:unchanged / pixel-identical / changed(1 像素)/ 尺寸變 / added 五面;建包版面 + sha256 對得上 + orphan;兩次建包決定性;缺新圖 / 缺歸因 / 輸出非空 / 0 場景 / 檔名帶路徑 五面拒絕;寫到一半失敗不留殘包')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function main(argv) {
  if (argv.includes('--selftest')) { selftest(); return 0 }
  const valueOf = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null }
  const attributionArg = valueOf('--attribution')
  const outArg = valueOf('--out')
  if (!attributionArg || !outArg) { console.error('用法:--attribution <歸因輸出目錄> --out <審核包目錄> | --selftest'); return 2 }
  const attributionDir = resolve(ROOT, attributionArg)
  const reportPath = join(attributionDir, 'report.json')
  if (!existsSync(reportPath)) fail(`歸因報告不在:${reportPath}(歸因那一步沒跑完 —— 沒有歸因的審核包不得產出)`)
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const scenarios = JSON.parse(readFileSync(join(ROOT, 'scripts/visual-assertions.json'), 'utf8')).scenarios || []
  const committedFiles = closedGit(['ls-tree', '--name-only', 'HEAD', `${CURATED_DIR}/`], 'capture')
    .split('\n').map((line) => line.trim()).filter(Boolean).map((path) => path.slice(CURATED_DIR.length + 1))
  if (!committedFiles.length) fail(`git HEAD 的 ${CURATED_DIR}/ 是空的 —— 讀不到已提交基準(不是「全部都是新增」)`)
  const committedSet = new Set(committedFiles)
  const readCommitted = (file) => (committedSet.has(file) ? closedGit(['show', `HEAD:${CURATED_DIR}/${file}`], 'buffer') : null)
  const readNew = (file) => { const path = join(ROOT, CURATED_DIR, file); return existsSync(path) ? readFileSync(path) : null }
  const env = process.env
  const commit = closedGit(['rev-parse', '--verify', 'HEAD^{commit}'], 'capture').trim()
  let request = null
  if (env.GITHUB_EVENT_NAME === 'push') {
    const parsed = readRebakeRequest(join(ROOT, REBAKE_REQUEST_PATH))
    if (!parsed.ok) fail(`push 事件但重拍請求檔讀不到或不合格:${parsed.errors.join(' / ')}`)
    request = parsed.request
  }
  const source = {
    repository: env.GITHUB_REPOSITORY || null,
    runId: env.GITHUB_RUN_ID || null,
    runAttempt: env.GITHUB_RUN_ATTEMPT || null,
    event: env.GITHUB_EVENT_NAME || null,
    ref: env.GITHUB_REF || null,
    commit,
    referenceRef: env.REFERENCE_REF || report.sinceRef || null,
    request,
  }
  const outDir = resolve(ROOT, outArg)
  const manifest = buildReviewPackage({ scenarios, readCommitted, readNew, committedFiles, attribution: { dir: attributionDir, report }, source, outDir })
  console.log(`✓ 審核包:${JSON.stringify(manifest.counts)};可核准 ${manifest.approvable.length} 張;歸因不得直接接受 ${manifest.attribution.blocking} 張 → ${outDir}`)
  for (const image of manifest.images.filter((row) => APPROVABLE_STATUSES.includes(row.status))) {
    console.log(`  ${image.status.padEnd(7)} ${image.file}  變動 ${image.exactChangedPixels ?? '-'} 像素(${image.exactChangedPct ?? '-'}%)  歸因 ${image.attribution.verdict}  after ${image.afterSha256}`)
  }
  return 0
}

// 比 realpath 不比字面路徑:經 symlink 呼叫時字面不等,CLI 會靜默不跑、結束碼 0(假綠)
const invokedDirectly = (() => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false } })()
if (invokedDirectly) {
  try { process.exitCode = main(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
