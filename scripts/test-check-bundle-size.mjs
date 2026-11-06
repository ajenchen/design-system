#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SIZE_LIMIT_FIX_MESSAGE,
  checkBundleSize,
  checkSizeLimitConfigSource,
  createBundleBudget,
  createSizeLimitBudget,
  deriveSizeLimitConfig,
  measureSizeLimit,
  runBundleSizeInit,
  sizeLimitKilobytes,
} from './check-bundle-size.mjs'

const fixtureRoot = mkdtempSync(join(tmpdir(), 'bundle-size-meta-'))
const distDir = join(fixtureRoot, 'dist')
const budgetPath = join(fixtureRoot, 'bundle-budget.json')
const measuredEntry = join(distDir, 'components', 'entry.js')
const checkModuleUrl = new URL('./check-bundle-size.mjs', import.meta.url).href

const SIZE_LIMIT_SECTION = {
  _meta: { generatedAt: '2026-07-22', unit: 'kB = 1000 bytes', rule: 'paired mutation fixture' },
  checks: [
    { name: 'App(all chunks)', path: 'dist/assets/*.js', limit: '78.4 kB', gzip: true },
    {
      name: 'Entry(component)',
      path: 'dist/components/entry.js',
      limit: '2.1 kB',
      gzip: true,
      ignore: ['react', 'react-dom', 'react/jsx-runtime', 'scheduler'],
    },
  ],
}
const RAW_BUDGET = {
  _meta: { generatedAt: '2026-07-22', rule: 'paired mutation fixture' },
  totalKB: 1.3,
  entriesKB: { 'components/entry.js': 1 },
}

function writeBudget(path, budget) {
  writeFileSync(path, `${JSON.stringify(budget, null, 2)}\n`)
}

function writeSizeLimitRoot(name, { packageJson = { name: 'fixture', private: true }, config, extraFiles = {} } = {}) {
  const root = join(fixtureRoot, name)
  mkdirSync(join(root, 'packages/design-system'), { recursive: true })
  writeBudget(join(root, 'packages/design-system/bundle-budget.json'), { ...RAW_BUDGET, sizeLimit: SIZE_LIMIT_SECTION })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  if (config !== undefined) writeFileSync(join(root, '.size-limit.mjs'), config)
  for (const [file, content] of Object.entries(extraFiles)) writeFileSync(join(root, file), content)
  return root
}

const DERIVED_CONFIG_SOURCE = [
  "import { fileURLToPath } from 'node:url'",
  `import { readSizeLimitConfig } from ${JSON.stringify(checkModuleUrl)}`,
  "export default readSizeLimitConfig({ root: fileURLToPath(new URL('.', import.meta.url)) })",
  '',
].join('\n')

try {
  mkdirSync(join(distDir, 'components'), { recursive: true })
  writeFileSync(measuredEntry, Buffer.alloc(1024, 0x61))
  writeFileSync(join(distDir, 'styles.css'), Buffer.alloc(256, 0x62))
  writeFileSync(join(distDir, 'ignored.map'), Buffer.alloc(4096, 0x63))
  writeBudget(budgetPath, { ...RAW_BUDGET, sizeLimit: SIZE_LIMIT_SECTION })

  // ── 原始 byte 段:基準綠 → 真的長大紅 → 還原綠 ─────────────────────────────────────────────
  const baseline = checkBundleSize({ distDir, budgetPath })
  assert.equal(baseline.ok, true, `fixture baseline must pass:${baseline.failures.join(';')}`)
  assert.equal(baseline.totalBytes, 1280, 'only measured .js/.css bytes belong to the gate')

  const original = readFileSync(measuredEntry)
  try {
    writeFileSync(measuredEntry, Buffer.concat([original, Buffer.alloc(1024, 0x64)]))
    const mutated = checkBundleSize({ distDir, budgetPath })
    assert.equal(mutated.ok, false, 'a real measured artifact growth must fail the gate')
    assert.equal(mutated.failures.some((failure) => failure.startsWith('total ')), true)
    assert.equal(mutated.failures.some((failure) => failure.startsWith('components/entry.js ')), true)
  } finally {
    writeFileSync(measuredEntry, original)
  }

  const restored = checkBundleSize({ distDir, budgetPath })
  assert.equal(restored.ok, true, `restored fixture must pass:${restored.failures.join(';')}`)

  const outside = join(fixtureRoot, 'outside.js')
  const link = join(distDir, 'linked.js')
  writeFileSync(outside, Buffer.alloc(64, 0x65))
  symlinkSync(outside, link)
  assert.throws(
    () => checkBundleSize({ distDir, budgetPath }),
    /symbolic link/,
    'a dist symlink must not read or count bytes outside the authenticated build tree',
  )
  rmSync(link)
  symlinkSync(join(distDir, 'components'), join(distDir, 'components', 'loop'))
  assert.throws(
    () => checkBundleSize({ distDir, budgetPath }),
    /symbolic link/,
    'a directory symlink loop must fail closed before recursive traversal',
  )
  rmSync(join(distDir, 'components', 'loop'))

  const initialized = createBundleBudget({
    distDir,
    headroom: 1.1,
    topN: 1,
    generatedAt: '2030-01-02',
  })
  assert.equal(initialized.budget._meta.generatedAt, '2030-01-02', 'init metadata must be injectable')
  assert.deepEqual(Object.keys(initialized.budget.entriesKB), ['components/entry.js'])

  // ── sizeLimit 段是同一份檔的必要部分:缺了 / 格式錯,PR 閘就紅(不是默默只量一半)────────────────
  const brokenBudgets = [
    [{ ...RAW_BUDGET }, /sizeLimit must be an object/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [] } }, /non-empty array/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [SIZE_LIMIT_SECTION.checks[0], { ...SIZE_LIMIT_SECTION.checks[0] }] } }, /duplicated/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [{ ...SIZE_LIMIT_SECTION.checks[0], limit: '78 KB' }] } }, /limit must look like/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [{ ...SIZE_LIMIT_SECTION.checks[0], limit: 78.4 }] } }, /limit must look like/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [{ ...SIZE_LIMIT_SECTION.checks[0], import: '{ x }' }] } }, /unsupported field import/],
    [{ ...RAW_BUDGET, sizeLimit: { checks: [{ ...SIZE_LIMIT_SECTION.checks[0], path: '' }] } }, /path must be a non-empty string/],
  ]
  for (const [budget, pattern] of brokenBudgets) {
    writeBudget(budgetPath, budget)
    assert.throws(() => checkBundleSize({ distDir, budgetPath }), pattern, `broken sizeLimit section must fail closed:${pattern}`)
  }
  writeBudget(budgetPath, { ...RAW_BUDGET, sizeLimit: SIZE_LIMIT_SECTION })
  assert.equal(checkBundleSize({ distDir, budgetPath }).ok, true, 'restored budget must pass again')

  // ── size-limit 設定只從 sizeLimit 段推導:逐項照抄 + 超標時印回這份檔與重設指令 ──────────────────
  const derived = deriveSizeLimitConfig({ ...RAW_BUDGET, sizeLimit: SIZE_LIMIT_SECTION })
  assert.deepEqual(derived, SIZE_LIMIT_SECTION.checks.map((check) => ({ ...check, message: SIZE_LIMIT_FIX_MESSAGE })))
  assert.match(SIZE_LIMIT_FIX_MESSAGE, /bundle-budget\.json/)
  assert.match(SIZE_LIMIT_FIX_MESSAGE, /--init/)

  // ── 重設:size-limit 量到的值 × headroom,無條件進位到 0.1 kB;量不到 / 多量到都不准重設 ───────────
  assert.equal(sizeLimitKilobytes(192565 * 1.1), '211.9 kB')
  assert.equal(sizeLimitKilobytes(30000), '30.0 kB')
  const sizes = new Map([['App(all chunks)', 71221], ['Entry(component)', 1800]])
  const resetSection = createSizeLimitBudget({ section: SIZE_LIMIT_SECTION, sizes, generatedAt: '2030-01-02' })
  assert.equal(resetSection._meta.generatedAt, '2030-01-02')
  assert.deepEqual(resetSection.checks.map((check) => check.limit), ['78.4 kB', '2.0 kB'])
  assert.deepEqual(resetSection.checks.map(({ limit, ...rest }) => rest), SIZE_LIMIT_SECTION.checks.map(({ limit, ...rest }) => rest))
  assert.throws(
    () => createSizeLimitBudget({ section: SIZE_LIMIT_SECTION, sizes: new Map([['App(all chunks)', 71221]]) }),
    /did not measure Entry\(component\)/,
    'a check that size-limit did not measure must not keep a stale limit silently',
  )
  assert.throws(
    () => createSizeLimitBudget({ section: SIZE_LIMIT_SECTION, sizes: new Map([...sizes, ['Ghost', 10]]) }),
    /not in the sizeLimit section/,
  )

  // --init 一支程式產兩段;--section 只動指定那段,另一段逐字保留
  const before = { ...RAW_BUDGET, sizeLimit: SIZE_LIMIT_SECTION }
  writeBudget(budgetPath, before)
  runBundleSizeInit({ distDir, budgetPath, section: 'size-limit', generatedAt: '2030-01-02', measureSizes: () => sizes })
  const afterSizeLimit = JSON.parse(readFileSync(budgetPath, 'utf8'))
  assert.deepEqual({ _meta: afterSizeLimit._meta, totalKB: afterSizeLimit.totalKB, entriesKB: afterSizeLimit.entriesKB }, RAW_BUDGET)
  assert.deepEqual(afterSizeLimit.sizeLimit, resetSection)

  writeBudget(budgetPath, before)
  runBundleSizeInit({
    distDir,
    budgetPath,
    section: 'raw',
    generatedAt: '2030-01-02',
    measureSizes: () => { throw new Error('raw-only reset must not run size-limit') },
  })
  const afterRaw = JSON.parse(readFileSync(budgetPath, 'utf8'))
  assert.deepEqual(afterRaw.sizeLimit, SIZE_LIMIT_SECTION)
  assert.equal(afterRaw._meta.generatedAt, '2030-01-02')

  writeBudget(budgetPath, before)
  runBundleSizeInit({ distDir, budgetPath, generatedAt: '2030-01-02', measureSizes: () => sizes })
  const afterAll = JSON.parse(readFileSync(budgetPath, 'utf8'))
  assert.equal(afterAll._meta.generatedAt, '2030-01-02')
  assert.deepEqual(afterAll.sizeLimit, resetSection)

  writeBudget(budgetPath, before)
  const untouched = readFileSync(budgetPath)
  assert.throws(
    () => runBundleSizeInit({ distDir, budgetPath, generatedAt: '2030-01-02', measureSizes: () => { throw new Error('dist missing') } }),
    /dist missing/,
  )
  assert.deepEqual(readFileSync(budgetPath), untouched, 'a failed measurement must leave the budget file untouched')

  // measureSizeLimit:size-limit 有項目超標(exit 1)照樣讀逐項 JSON;沒有逐項結果(缺 dist 時的 {"error"})一律失敗
  const fakeSizeLimit = (name, body) => {
    const root = join(fixtureRoot, name)
    mkdirSync(join(root, 'node_modules/size-limit'), { recursive: true })
    writeFileSync(join(root, 'node_modules/size-limit/bin.js'), body)
    return root
  }
  const overLimitRoot = fakeSizeLimit('fake-over-limit', [
    "process.stdout.write(JSON.stringify([{ name: 'App(all chunks)', passed: false, size: 71221, sizeLimit: 70000 }]))",
    'process.exitCode = 1',
    '',
  ].join('\n'))
  assert.deepEqual([...measureSizeLimit({ root: overLimitRoot })], [['App(all chunks)', 71221]])
  const errorRoot = fakeSizeLimit('fake-error', [
    "process.stdout.write(JSON.stringify({ error: 'Size Limit can’t find files at dist/assets/*.js' }))",
    'process.exitCode = 1',
    '',
  ].join('\n'))
  assert.throws(() => measureSizeLimit({ root: errorRoot }), /沒有逐項結果/)
  const noJsonRoot = fakeSizeLimit('fake-no-json', "process.stderr.write('boom')\nprocess.exitCode = 2\n")
  assert.throws(() => measureSizeLimit({ root: noJsonRoot }), /沒有輸出 JSON/)

  // ── size-limit 實際讀到的只能是推導那份:基準綠 → 第二份設定紅 ──────────────────────────────────
  const derivedRoot = writeSizeLimitRoot('source-derived', { config: DERIVED_CONFIG_SOURCE })
  const sourceBaseline = await checkSizeLimitConfigSource({ root: derivedRoot })
  assert.equal(sourceBaseline.ok, true, `derived config must pass:${sourceBaseline.failures.join(';')}`)

  const shadowPackageRoot = writeSizeLimitRoot('source-package-json', {
    config: DERIVED_CONFIG_SOURCE,
    packageJson: { name: 'fixture', private: true, 'size-limit': [{ path: 'dist/assets/*.js', limit: '300 KB' }] },
  })
  const shadowPackage = await checkSizeLimitConfigSource({ root: shadowPackageRoot })
  assert.equal(shadowPackage.ok, false, 'a package.json "size-limit" section shadows the derived config and must fail')
  assert.match(shadowPackage.failures.join('\n'), /package\.json 有 "size-limit" 段/)

  const shadowFileRoot = writeSizeLimitRoot('source-json-file', {
    config: DERIVED_CONFIG_SOURCE,
    extraFiles: { '.size-limit.json': '[]\n' },
  })
  const shadowFile = await checkSizeLimitConfigSource({ root: shadowFileRoot })
  assert.equal(shadowFile.ok, false)
  assert.match(shadowFile.failures.join('\n'), /\.size-limit\.json 存在/)

  const hardcodedRoot = writeSizeLimitRoot('source-hardcoded', {
    config: `export default ${JSON.stringify(SIZE_LIMIT_SECTION.checks)}\n`,
  })
  const hardcoded = await checkSizeLimitConfigSource({ root: hardcodedRoot })
  assert.equal(hardcoded.ok, false, 'a hand-written limit array is a second budget and must fail')
  assert.match(hardcoded.failures.join('\n'), /不等於/)

  const missingRoot = writeSizeLimitRoot('source-missing')
  const missing = await checkSizeLimitConfigSource({ root: missingRoot })
  assert.equal(missing.ok, false)
  assert.match(missing.failures.join('\n'), /\.size-limit\.mjs 不存在/)
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}

console.log('✅ bundle-size paired mutation: raw growth FAIL / broken sizeLimit section FAIL / second size-limit config FAIL;baseline + restore PASS;--init resets both sections from one run')
