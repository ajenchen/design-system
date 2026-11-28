#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: consumer 升級交易(verify-upgrade-evidence.mjs)只擋這次升級真的新增的弱點,而且 npm 內附 tar / brace-expansion 兩邊用同一個修補層口徑比;
 *         另外,這一版出貨的每個受管檔與共用 launcher 位置,都落在現行 sync-all 與上一個已發布版 sync-all 的 TRANSACTION_PATHS 內
 *         (產品升級時跑的是上一版的交易程式,落在外面就整筆以 GOV-UPGRADE-008 中止)
 *   紅: 拿掉差集的 installedOverlayReceipt(或讓修補層口徑失效)→ 錨例(base 鎖檔記修補層版本)重現 workspace 回報的同兩筆 package-not-vulnerable-in-base 而紅;
 *       受管清單多一個根目錄檔(0.1.0-beta.153 候選 e39ac6ea 的 .node-version 錨例)→ 對現行與上一版兩份清單都指名它而紅
 *   綠: 錨例、兩邊都記原裝、反方向都不擋;一般相依新增、修補層沒修到的通報、修補層範圍外的節點、非現行 receipt 照擋 —— 純函式,重跑恆等;
 *       現行受管清單全在兩份 TRANSACTION_PATHS 內才綠,讀不到上一個發布 tag 或它的 sync-all 一律紅(儀器失效,不當通過)
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  applyPreverifiedUpgradeEvidence,
  assertLiveProtectedMain,
  assertProtectedPackageScripts,
  requiresReviewedBootstrap,
  stagedUpgradeOperations,
  stagedWorkspaceDependencyManifests,
  upgradeAuthoritySha256,
  upgradeVerificationSha256,
  validateUpgradeOperations,
  validateUpgradeReceipt,
  verifyAndApplyUpgradeEvidence,
} from './verify-upgrade-evidence.mjs'
import {
  assertNoIntroducedAuditFindings,
  diffAuditFindings,
  parseAuditFindings,
} from './lib/governance-dependency-bootstrap.mjs'
import { resolveExactNpmRuntimeContract } from './lib/verified-exact-npm-runtime.mjs'
import {
  REVIEWED_CONTROL_PLANE_UPDATE_COMMAND,
  REVIEWED_CONTROL_PLANE_UPDATE_ROUTE,
  canonicalPackageScripts,
  packageScriptsAreIdentical,
  requiresReviewedControlPlaneUpdate,
} from './lib/consumer-control-plane-policy.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const version = '1.2.3'
const previousCorpus = {
  releaseVersion: '1.2.2',
  consumerBomSha256: '1'.repeat(64),
  forkCorpusLockSha256: '2'.repeat(64),
  manifestSha256: '3'.repeat(64),
  providerLifecycleSha256: '4'.repeat(64),
}
const incomingCorpus = {
  releaseVersion: version,
  consumerBomSha256: '5'.repeat(64),
  forkCorpusLockSha256: '6'.repeat(64),
  manifestSha256: '7'.repeat(64),
  providerLifecycleSha256: '8'.repeat(64),
}
const provenance = {
  repository: 'ajenchen/design-system',
  workflow: '.github/workflows/release.yml',
  tag: `v${version}`,
  tagObject: 'e'.repeat(40),
  gitCommit: '9'.repeat(40),
  gitTree: 'f'.repeat(40),
  bomSha256: 'a'.repeat(64),
  releaseAssetDigest: `sha256:${'a'.repeat(64)}`,
  releaseSetSha256: 'b'.repeat(64),
  finalizationReceiptSha256: 'c'.repeat(64),
  releaseTrustEvidenceSha256: 'd'.repeat(64),
  packages: [
    { name: '@qijenchen/design-system', version, integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
    { name: '@qijenchen/storybook-config', version, integrity: `sha512-${Buffer.alloc(64, 2).toString('base64')}` },
  ],
}
const toolchain = { node: 'v22.22.0', npm: '11.19.0' }

const authority = {
  schemaVersion: 1,
  previousCorpus,
  incomingCorpus,
  provenance,
  toolchain,
  previousMaterialization: {
    exactPaths: ['governance/lock.json', 'governance/old.md', 'package-lock.json'],
    pathPrefixes: ['.agents/skills/existing/'],
  },
  incomingMaterialization: {
    exactPaths: ['governance/lock.json', 'governance/setup.md', 'package-lock.json'],
    pathPrefixes: ['.agents/skills/existing/', '.agents/skills/new-skill/'],
  },
  retirementDeletes: [{ kind: 'tree', path: '.legacy-provider', sha256: 'b'.repeat(64) }],
  workspaceDependencyManifests: [],
}

const patch = Buffer.from('fixture patch\n')
const base = 'c'.repeat(40)
const operations = [{ path: 'governance/lock.json', status: 'M' }]
const receipt = {
  schemaVersion: 2,
  baseSha: base,
  version,
  patchSha256: sha256(patch),
  treeSha256: 'd'.repeat(40),
  paths: operations.map(item => item.path),
  operations,
  previousCorpus,
  incomingCorpus,
  provenance,
  authoritySha256: upgradeAuthoritySha256(authority),
  toolchain,
}

test('committed v2 JSON Schema accepts the canonical receipt and rejects an open receipt', () => {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, 'schemas/upgrade-evidence-receipt.schema.json'), 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors))
  assert.equal(validate({ ...receipt, attacker: true }), false)
  // Ordinary six-file release(retired ceremony 資產不存在)→ 兩 receipt 欄為 null 合法
  const ordinaryProvenance = { ...provenance, finalizationReceiptSha256: null, releaseTrustEvidenceSha256: null }
  assert.equal(validate({ ...receipt, provenance: ordinaryProvenance }), true, 'ordinary release provenance must validate')
  // key 缺席仍必拒(閉合 shape 不因可為 null 而放寬)
  for (const field of ['finalizationReceiptSha256', 'releaseTrustEvidenceSha256']) {
    const withoutKey = { ...provenance }
    delete withoutKey[field]
    assert.equal(validate({ ...receipt, provenance: withoutKey }), false, `missing ${field}`)
  }
  for (const field of [
    'tagObject', 'gitTree', 'releaseSetSha256',
    'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
  ]) {
    assert.equal(validate({ ...receipt, provenance: { ...provenance, [field]: 'not-a-bound-identity' } }), false, field)
  }
})

test('accepts a v2 receipt rebound to protected-base authority and certifier outputs', () => {
  const validated = validateUpgradeReceipt({
    receipt,
    patchBytes: patch,
    expectedBaseSha: base,
    expectedVersion: version,
    expectedPatchSha256: receipt.patchSha256,
    expectedTreeSha: receipt.treeSha256,
    expectedAuthoritySha256: receipt.authoritySha256,
    authority,
  })
  assert.deepEqual(validated.operations, operations)
})

test('operation authority supports retained edits, new paths and current retirement deletes', () => {
  assert.deepEqual(validateUpgradeOperations([
    { path: '.agents/skills/existing/added-reference.md', status: 'A' },
    { path: '.agents/skills/existing/removed-reference.md', status: 'D' },
    { path: '.agents/skills/new-skill/SKILL.md', status: 'A' },
    { path: '.legacy-provider/OLD.md', status: 'D' },
    { path: 'governance/lock.json', status: 'M' },
    { path: 'governance/setup.md', status: 'A' },
  ], authority).length, 6)
})

for (const [label, poisoned, pattern] of [
  ['candidate takeover of a product path', [{ path: 'apps/product/src/backdoor.ts', status: 'M' }], /not retained governance authority/],
  ['modification at an incoming-only path', [{ path: 'governance/setup.md', status: 'M' }], /not retained governance authority/],
  ['un-tombstoned removal of old authority', [{ path: 'governance/old.md', status: 'D' }], /no retained authority/],
  ['write into a retired provider root', [{ path: '.legacy-provider/OLD.md', status: 'M' }], /not retained governance authority/],
  ['unsupported type-changing status', [{ path: 'governance/lock.json', status: 'T' }], /unsupported/],
]) {
  test(`rejects ${label}`, () => assert.throws(() => validateUpgradeOperations(poisoned, authority), pattern))
}

for (const path of [
  '.github/workflows/audit.yml',
  '.npmrc',
  'governance/bin/normalize-provider-event.mjs',
  'scripts/audit-consumer-a11y.mjs',
]) {
  test(`release-bound control-plane operation is carried as data(BOOTSTRAP-001 retired 2026-08-12): ${path}`, () => {
    // 2026-08-12 契約更新:舊契約要求 reviewed lane(需非作者簽署,單人 fleet 不可滿足 =
    // 死路,AGENTS.md 已判該儀式退役)。新契約:出處已驗的 release 內容(含控制面路徑)
    // 以資料照常入 diff,由 PR + required check 審視;不再 throw。
    const protectedAuthority = {
      ...authority,
      previousMaterialization: { exactPaths: [path], pathPrefixes: [] },
      incomingMaterialization: { exactPaths: [path], pathPrefixes: [] },
    }
    for (const status of ['A', 'M', 'D']) {
      assert.doesNotThrow(
        () => validateUpgradeOperations([{ path, status }], protectedAuthority),
        `${status}:${path}`,
      )
    }
  })
}

test('protected control-plane classification is one closed SSOT with safe near misses', () => {
  for (const path of [
    '.github/workflows/audit.yml',
    '.npmrc',
    'governance/bin/normalize-provider-event.mjs',
    'scripts/sync-all.mjs',
  ]) {
    assert.equal(requiresReviewedControlPlaneUpdate(path), true, path)
    assert.equal(requiresReviewedBootstrap(path), true, path)
  }
  for (const path of [
    '.github-safe/workflows/audit.yml',
    '.npmrc.example',
    'governance/binary/data.json',
    'scripts-safe/sync-all.mjs',
    'governance/lock.json',
  ]) {
    assert.equal(requiresReviewedControlPlaneUpdate(path), false, path)
    assert.equal(requiresReviewedBootstrap(path), false, path)
  }
  assert.equal(REVIEWED_CONTROL_PLANE_UPDATE_ROUTE.includes(REVIEWED_CONTROL_PLANE_UPDATE_COMMAND), true)

  const verifierSource = readFileSync(join(import.meta.dirname, 'verify-upgrade-evidence.mjs'), 'utf8')
  assert.match(verifierSource, /from '\.\/lib\/consumer-control-plane-policy\.mjs'/)
  assert.doesNotMatch(verifierSource, /BOOTSTRAP_ONLY_(?:EXACT_PATHS|PATH_PREFIXES)/)
})

test('package-script classification is canonical, closed, and order-independent', () => {
  const previous = { scripts: { test: 'node test.mjs', build: 'node build.mjs' } }
  const reordered = { scripts: { build: 'node build.mjs', test: 'node test.mjs' } }
  const changed = { scripts: { build: 'node takeover.mjs', test: 'node test.mjs' } }
  const added = { scripts: { build: 'node build.mjs', lint: 'node lint.mjs', test: 'node test.mjs' } }
  const removed = { scripts: { build: 'node build.mjs' } }
  assert.deepEqual(Object.keys(canonicalPackageScripts(previous)), ['build', 'test'])
  assert.equal(packageScriptsAreIdentical(previous, reordered), true)
  assert.equal(packageScriptsAreIdentical(previous, changed), false)
  assert.equal(packageScriptsAreIdentical(previous, added), false)
  assert.equal(packageScriptsAreIdentical(previous, removed), false)
  assert.throws(() => canonicalPackageScripts({ scripts: [] }), /scripts are invalid/)
  assert.throws(() => canonicalPackageScripts({ scripts: { build: '' } }), /script build is invalid/)
})

test('rejects open receipts, digest substitution, output substitution and operation/path mismatch', () => {
  const common = { patchBytes: patch, expectedBaseSha: base, expectedVersion: version }
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, attacker: true } }), /open or incomplete/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, patchBytes: Buffer.from('different') }), /patch digest mismatch/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, expectedPatchSha256: 'e'.repeat(64) }), /certifier patch output/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt, expectedTreeSha: 'e'.repeat(40) }), /certifier tree output/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, paths: ['governance//lock.json'] } }), /non-canonical|differ/)
  assert.throws(() => validateUpgradeReceipt({ ...common, receipt: { ...receipt, operations: [...receipt.operations, receipt.operations[0]], paths: [...receipt.paths, receipt.paths[0]] } }), /duplicate/)
})

test('accepts an ordinary six-file release whose retired ceremony receipts are absent', () => {
  // 2026-08-05:標準 release 從不產生 npm-finalization-receipt.json / release-trust-preflight.json
  // (producer 端輸出 null)。null 必須合法,否則 consumer 自動升級永遠 fail-closed。
  const ordinaryProvenance = { ...provenance, finalizationReceiptSha256: null, releaseTrustEvidenceSha256: null }
  const ordinaryAuthority = { ...authority, provenance: ordinaryProvenance }
  const validated = validateUpgradeReceipt({
    receipt: { ...receipt, provenance: ordinaryProvenance, authoritySha256: upgradeAuthoritySha256(ordinaryAuthority) },
    patchBytes: patch,
    expectedBaseSha: base,
    expectedVersion: version,
    expectedAuthoritySha256: upgradeAuthoritySha256(ordinaryAuthority),
    authority: ordinaryAuthority,
  })
  assert.equal(validated.provenance.finalizationReceiptSha256, null)
  assert.equal(validated.provenance.releaseTrustEvidenceSha256, null)
})

test('rejects a half-present ceremony receipt pair', () => {
  // present-but-unpaired = 證據鏈殘缺,必 fail-closed(兩方向都測)
  const common = { patchBytes: patch, expectedBaseSha: base, expectedVersion: version }
  for (const half of [
    { finalizationReceiptSha256: 'c'.repeat(64), releaseTrustEvidenceSha256: null },
    { finalizationReceiptSha256: null, releaseTrustEvidenceSha256: 'd'.repeat(64) },
  ]) {
    assert.throws(
      () => validateUpgradeReceipt({ ...common, receipt: { ...receipt, provenance: { ...provenance, ...half } } }),
      /paired release trust evidence/,
    )
  }
})

test('rejects malformed and semantically detached immutable-release provenance', () => {
  const common = { patchBytes: patch, expectedBaseSha: base, expectedVersion: version }
  for (const field of [
    'tagObject', 'gitTree', 'releaseSetSha256',
    'finalizationReceiptSha256', 'releaseTrustEvidenceSha256',
  ]) {
    assert.throws(
      () => validateUpgradeReceipt({ ...common, receipt: { ...receipt, provenance: { ...provenance, [field]: 'not-a-bound-identity' } } }),
      new RegExp(field),
    )
  }
  assert.throws(
    () => validateUpgradeReceipt({
      ...common,
      receipt: { ...receipt, provenance: { ...provenance, releaseAssetDigest: `sha256:${'0'.repeat(64)}` } },
    }),
    /immutable Release BOM binding/,
  )
  assert.throws(
    () => validateUpgradeReceipt({
      ...common,
      receipt: {
        ...receipt,
        provenance: {
          ...provenance,
          packages: [provenance.packages[0], { ...provenance.packages[1], version: '1.2.4' }],
        },
      },
    }),
    /one exact release version/,
  )
})

test('binds every immutable-release identity into protected-base authority', () => {
  const common = {
    patchBytes: patch,
    expectedBaseSha: base,
    expectedVersion: version,
    expectedAuthoritySha256: receipt.authoritySha256,
    authority,
  }
  for (const [field, replacement] of [
    ['tagObject', '0'.repeat(40)],
    ['gitTree', '1'.repeat(40)],
    ['releaseSetSha256', '2'.repeat(64)],
    ['finalizationReceiptSha256', '3'.repeat(64)],
    ['releaseTrustEvidenceSha256', '4'.repeat(64)],
  ]) {
    assert.throws(
      () => validateUpgradeReceipt({
        ...common,
        receipt: { ...receipt, provenance: { ...provenance, [field]: replacement } },
      }),
      /receipt provenance differs from protected-base reconstruction/,
      field,
    )
  }
  // anti-downgrade:把「有 ceremony 證據」的 release 整組冒充成 ordinary(兩欄同時改 null,
  // 本身是合法 shape、過得了配對律)仍必被 authority 重建比對擋下 — 這是可為 null 之後
  // 最關鍵的一條防線(2026-08-05)。
  assert.throws(
    () => validateUpgradeReceipt({
      ...common,
      receipt: { ...receipt, provenance: { ...provenance, finalizationReceiptSha256: null, releaseTrustEvidenceSha256: null } },
    }),
    /receipt provenance differs from protected-base reconstruction/,
    'ordinary-shape downgrade',
  )
})

test('routes workflow-executed package script changes to recurring reviewed control-plane update', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-package-scripts-')))
  try {
    writeFileSync(join(root, 'package.json'), '{"scripts":{"build":"node trusted-build.mjs"}}\n')
    git(root, ['init', '--quiet'])
    git(root, ['config', 'user.name', 'Fixture'])
    git(root, ['config', 'user.email', 'fixture@example.invalid'])
    git(root, ['add', '-A'])
    git(root, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(root, ['rev-parse', 'HEAD']).trim()
    writeFileSync(join(root, 'package.json'), '{"scripts":{"build":"node candidate-takeover.mjs"}}\n')
    // 2026-08-12 契約更新(BOOTSTRAP-002 退役,理由同 001):package scripts 差異以資料入
    // diff 受審,不再 throw。
    assert.doesNotThrow(() => assertProtectedPackageScripts(root, fixtureBase))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('protected-base reconstruction uses the independent lock-digested npm runtime', () => {
  const source = readFileSync(join(import.meta.dirname, 'verify-upgrade-evidence.mjs'), 'utf8')
  assert.match(source, /runtimeFactory = prepareVerifiedExactNpmRuntime/)
  assert.match(source, /resolveExactNpmRuntimeContract\(repo\)/)
  assert.match(source, /assertVerifiedExactNpmRuntimeCapability\(npmRuntime, expectedNpmArtifact\)/)
  assert.match(source, /verifiedNpmNodeArgv\(cli, \[\n\s+'ci', '--legacy-peer-deps', '--ignore-scripts'/)
  assert.doesNotMatch(source, /process\.execPath, \[\s*cli\b/, 'every verified npm spawn must carry the system trust-store flag')
  assert.doesNotMatch(source, /protectedNpmToolchain|node_modules\/npm\/bin\/npm-cli\.js/)
  const baseInstall = source.indexOf("'ci', '--legacy-peer-deps'")
  const previousValidation = source.indexOf('const previousCorpus = validateInstalledForkCorpus(sandbox)')
  const targetInstall = source.indexOf("'install',", previousValidation)
  const overlayApply = source.indexOf('npmRuntime.applyInstalledSecurityOverlay(sandbox)', targetInstall)
  const baseAudit = source.indexOf('const baseVulnerabilityAudit = runAuditFindingsJson(cli, sandbox', baseInstall)
  const signatureAudit = source.indexOf("'audit', 'signatures'", overlayApply)
  const candidateAudit = source.indexOf('const candidateVulnerabilityAudit = runAuditFindingsJson(cli, sandbox', signatureAudit)
  const differential = source.indexOf('assertNoIntroducedAuditFindings(diffAuditFindings(baseVulnerabilityAudit.findings, candidateVulnerabilityAudit.findings', candidateAudit)
  // 2026-09-30:升級交易的弱點裁決改為差集 —— base 稽核必須在 protected base 安裝後、目標版安裝前;
  // candidate 稽核在 overlay 與簽章稽核之後;裁決只擋 introduced(與 DS anchor 同一份 lib 實作)。
  assert.ok(
    baseInstall > 0
      && baseInstall < baseAudit
      && baseAudit < previousValidation
      && previousValidation < targetInstall
      && targetInstall < overlayApply
      && overlayApply < signatureAudit
      && signatureAudit < candidateAudit
      && candidateAudit < differential,
  )
  assert.doesNotMatch(source, /runVerifiedHighVulnerabilityAudit/, 'the upgrade transaction must not fall back to the exact-shape enforce audit')
  // 2026-11-28:差集帶上候選樹已驗過的修補層 receipt(npm 內附 tar / brace-expansion 兩邊同一個口徑);拿掉這個參數 = 錨例重新被擋。
  assert.match(
    source.slice(differential),
    /^assertNoIntroducedAuditFindings\(diffAuditFindings\(baseVulnerabilityAudit\.findings, candidateVulnerabilityAudit\.findings, \{\s*installedOverlayReceipt,\s*\}\)/,
    'the upgrade differential must compare npm bundled overlay slots with the verified installed overlay receipt',
  )
})

test('upgrade transaction blocks only findings the upgrade introduces and reports inherited ones', async () => {
  const { assertNoIntroducedAuditFindings, diffAuditFindings, parseAuditFindings } = await import('./lib/governance-dependency-bootstrap.mjs')
  const report = (entries) => JSON.stringify({ auditReportVersion: 2, vulnerabilities: Object.fromEntries(entries.map(([name, source, url]) => [name, { name, severity: 'high', range: '<9', via: [{ source, url }] }])) })
  const base = parseAuditFindings(report([['brace-expansion', 1240107, 'https://github.com/advisories/GHSA-qhr7-859c-m2p7']]), 'protected-base', 'GOV-UPGRADE-DEPENDENCY-001')
  const lines = []
  const inheritedOnly = diffAuditFindings(base, parseAuditFindings(report([['brace-expansion', 1240107, 'https://github.com/advisories/GHSA-qhr7-859c-m2p7']]), 'candidate', 'GOV-UPGRADE-DEPENDENCY-001'))
  assert.doesNotThrow(() => assertNoIntroducedAuditFindings(inheritedOnly, { prefix: 'GOV-UPGRADE-DEPENDENCY-001', subject: 'upgrade to 0.1.0-beta.148', report: (line) => lines.push(line) }))
  assert.ok(lines.some((line) => line.includes('brace-expansion')), 'an inherited finding is still reported')
  const introduced = diffAuditFindings(base, parseAuditFindings(report([
    ['brace-expansion', 1240107, 'https://github.com/advisories/GHSA-qhr7-859c-m2p7'],
    ['fast-uri', 1240200, 'https://github.com/advisories/GHSA-hrr3-gc8f-f4qj'],
  ]), 'candidate', 'GOV-UPGRADE-DEPENDENCY-001'))
  assert.throws(() => assertNoIntroducedAuditFindings(introduced, { prefix: 'GOV-UPGRADE-DEPENDENCY-001', subject: 'upgrade to 0.1.0-beta.148', report: () => {} }), /GOV-UPGRADE-DEPENDENCY-001:upgrade to 0\.1\.0-beta\.148 introduces 1 vulnerability finding\(s\)[\s\S]*fast-uri/)
  assert.throws(() => parseAuditFindings('not json', 'candidate', 'GOV-UPGRADE-DEPENDENCY-001'), /GOV-UPGRADE-DEPENDENCY-001:candidate npm audit did not produce JSON/, 'a broken audit is never read as "no findings"')
})

// 2026-11-28 workspace 0.1.0-beta.151 → 152 被擋(GOV-UPGRADE-DEPENDENCY-001 brace-expansion / tar package-not-vulnerable-in-base):
// base 鎖檔記 npm 內附的修補層版本(tar 7.5.22 / brace-expansion 5.0.12,稽核沒有這兩筆;修補層套上後再跑一般 npm install
// 就會這樣記),交易在原裝磁碟上重算的鎖檔記原裝版本(7.5.19 / 5.0.7)。下面的通報形狀取自同一天以 npm 11.19.0 對合成樹實跑的
// npm audit --json(tar / brace-expansion 兩筆逐字;npm 那筆只留比對用得到的欄位)。
const UPGRADE_PREFIX = 'GOV-UPGRADE-DEPENDENCY-001'
const BUNDLED_TAR = Object.freeze({
  name: 'tar', severity: 'high', isDirect: false, range: '<=7.5.20', nodes: ['node_modules/npm/node_modules/tar'], effects: ['npm'],
  via: [{ source: 1145647, name: 'tar', dependency: 'tar', url: 'https://github.com/advisories/GHSA-r292-9mhp-454m', severity: 'high', range: '<=7.5.20' }],
})
const BUNDLED_BRACE_EXPANSION = Object.freeze({
  name: 'brace-expansion', severity: 'high', isDirect: false, range: '4.0.0 - 5.0.11', nodes: ['node_modules/npm/node_modules/brace-expansion'], effects: [],
  via: [
    { source: 1130591, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg', severity: 'high', range: '>=4.0.0 <5.0.8' },
    { source: 1130734, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895', severity: 'high', range: '>=4.0.0 <5.0.9' },
    { source: 1240103, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr', severity: 'moderate', range: '>=4.0.0 <5.0.12' },
    { source: 1240107, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-qhr7-859c-m2p7', severity: 'high', range: '>=4.0.0 <5.0.11' },
    { source: 1240111, name: 'brace-expansion', dependency: 'brace-expansion', url: 'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p', severity: 'high', range: '>=4.0.0 <5.0.10' },
  ],
})
const BUNDLED_MINIMATCH = Object.freeze({
  name: 'minimatch', severity: 'moderate', isDirect: false, range: '7.0.0 - 11.0.0', nodes: ['node_modules/npm/node_modules/minimatch'], effects: ['npm'],
  via: [{ source: 1244623, name: 'minimatch', dependency: 'minimatch', url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249', severity: 'moderate', range: '>=7.0.0 <11.0.1' }],
})
const npmMetavulnerability = (severity, via) => ({ name: 'npm', severity, isDirect: true, range: '*', nodes: ['node_modules/npm'], effects: [], via })
const upgradeAudit = (label, vulnerabilities) => parseAuditFindings(
  JSON.stringify({ auditReportVersion: 2, vulnerabilities: Object.fromEntries(vulnerabilities.map((finding) => [finding.name, finding])) }),
  label,
  UPGRADE_PREFIX,
)
// 候選樹上 applyInstalledSecurityOverlay 回的已驗 receipt:欄位取自 repo 自己的修補層契約(與正式碼同一份來源)。
const installedOverlayReceipt = Object.freeze({ ...resolveExactNpmRuntimeContract(join(import.meta.dirname, '..')).securityOverlay, status: 'verified' })
const lockedOverlayBase = () => upgradeAudit('protected-base', [npmMetavulnerability('moderate', ['minimatch']), BUNDLED_MINIMATCH])
const pristineCandidate = (extra = []) => upgradeAudit('candidate', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, BUNDLED_TAR, BUNDLED_BRACE_EXPANSION, ...extra])
const verdict = (diff) => {
  const lines = []
  try {
    assertNoIntroducedAuditFindings(diff, { prefix: UPGRADE_PREFIX, subject: 'upgrade to 0.1.0-beta.153', baseLabel: 'the consumer protected base', report: (line) => lines.push(line) })
    return { blocked: null, lines }
  } catch (error) {
    return { blocked: String(error.message), lines }
  }
}

test('upgrade differential compares npm bundled overlay slots on the same basis on both sides (anchor: base lock records the overlay versions)', () => {
  const fixedDiff = diffAuditFindings(lockedOverlayBase(), pristineCandidate(), { installedOverlayReceipt })
  const fixed = verdict(fixedDiff)
  assert.equal(fixed.blocked, null, 'the anchor case must not be blocked')
  assert.deepEqual(fixedDiff.introduced, [])
  assert.deepEqual(fixedDiff.overlayRemediated.map((item) => [item.name, item.node, item.overlayVersion]), [
    ['brace-expansion', 'node_modules/npm/node_modules/brace-expansion', '5.0.12'],
    ['tar', 'node_modules/npm/node_modules/tar', '7.5.22'],
  ])
  assert.deepEqual(fixedDiff.inherited.map((item) => item.name), ['minimatch', 'npm'])
  assert.ok(fixed.lines.some((line) => line.includes('修補層已修') && line.includes('tar high <=7.5.20')), 'overlay-remediated findings are still printed')
  // 拿掉修法(不帶 receipt)= 0.1.0-beta.152 以前的口徑:重現 workspace 回報的 BLOCKER(同兩筆、同順序、同 reason 與 advisory;只有版號是測試用的)。
  const unfixed = verdict(diffAuditFindings(lockedOverlayBase(), pristineCandidate()))
  assert.match(unfixed.blocked, /GOV-UPGRADE-DEPENDENCY-001:upgrade to 0\.1\.0-beta\.153 introduces 2 vulnerability finding\(s\) that the consumer protected base does not have:\n {2}brace-expansion high 4\.0\.0 - 5\.0\.11\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-6j4f-fj2g-mc7p, [^\n]+\n {2}tar high <=7\.5\.20\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-r292-9mhp-454m$/)
  // 對稱:兩邊都記原裝版本(DS / 範本 main 的鎖檔)→ 兩邊同樣拿掉,不擋、也不誤報成「已修掉」。
  const pristineBase = upgradeAudit('protected-base', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, BUNDLED_TAR, BUNDLED_BRACE_EXPANSION])
  const symmetric = diffAuditFindings(pristineBase, pristineCandidate(), { installedOverlayReceipt })
  assert.equal(verdict(symmetric).blocked, null)
  assert.deepEqual(symmetric.resolved, [])
  // 反方向:base 記原裝、候選記修補層版本 → 照舊不擋(候選沒有那兩筆)。
  const reverse = diffAuditFindings(pristineBase, upgradeAudit('candidate', [npmMetavulnerability('moderate', ['minimatch']), BUNDLED_MINIMATCH]), { installedOverlayReceipt })
  assert.equal(verdict(reverse).blocked, null)
})

test('upgrade differential still blocks what the overlay does not cover', () => {
  // 一般相依真的新增(lodash 4.17.20 實跑的通報之一)→ 照擋,只點名 lodash。
  const lodash = { name: 'lodash', severity: 'high', isDirect: true, range: '<=4.17.23', nodes: ['node_modules/lodash'], effects: [], via: [{ source: 1106913, name: 'lodash', dependency: 'lodash', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', severity: 'high', range: '<4.17.21' }] }
  const general = verdict(diffAuditFindings(lockedOverlayBase(), pristineCandidate([lodash]), { installedOverlayReceipt }))
  assert.match(general.blocked, /introduces 1 vulnerability finding\(s\)[^\n]*:\n {2}lodash high <=4\.17\.23\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-35jh-r3h4-6jhm$/)
  // 修補層版本也在範圍內的通報(修補層沒修到)→ 照擋,只點名那一則;範圍外的那則仍算修補層已修。
  const pastOverlay = { source: 1, name: 'tar', dependency: 'tar', url: 'https://github.com/advisories/GHSA-test-tar-past-overlay', severity: 'high', range: '<=7.5.23' }
  const uncoveredDiff = diffAuditFindings(lockedOverlayBase(), upgradeAudit('candidate', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, { ...BUNDLED_TAR, range: '<=7.5.23', via: [...BUNDLED_TAR.via, pastOverlay] }, BUNDLED_BRACE_EXPANSION]), { installedOverlayReceipt })
  assert.match(verdict(uncoveredDiff).blocked, /introduces 1 vulnerability finding\(s\)[^\n]*:\n {2}tar high <=7\.5\.23\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-test-tar-past-overlay$/)
  assert.deepEqual(uncoveredDiff.overlayRemediated.find((item) => item.name === 'tar')?.advisories, ['https://github.com/advisories/GHSA-r292-9mhp-454m'])
  // 同一則修補層沒修到的通報 base 也有(base 記修補層版本照樣受影響)→ 繼承,不因候選多列了修補層已修的那則而擋。
  const inheritedPast = diffAuditFindings(
    upgradeAudit('protected-base', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, { ...BUNDLED_TAR, range: '7.5.21 - 7.5.23', via: [pastOverlay] }]),
    upgradeAudit('candidate', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, { ...BUNDLED_TAR, range: '<=7.5.23', via: [...BUNDLED_TAR.via, pastOverlay] }, BUNDLED_BRACE_EXPANSION]),
    { installedOverlayReceipt },
  )
  assert.equal(verdict(inheritedPast).blocked, null)
  assert.deepEqual(inheritedPast.inherited.find((item) => item.name === 'tar')?.advisories, ['https://github.com/advisories/GHSA-test-tar-past-overlay'])
  // 修補層沒蓋到的 npm 內附套件(minimatch:節點只有 npm 內附那一份,但不是修補層的 slot)只在候選出現 → 照擋,只點名它;
  // 同一份候選裡 tar / brace-expansion 仍算修補層已修(slot 只認修補層那兩個,不因為「也是 npm 內附」就放寬)。
  const unslottedBundledDiff = diffAuditFindings(upgradeAudit('protected-base', [npmMetavulnerability('moderate', [])]), pristineCandidate(), { installedOverlayReceipt })
  assert.match(verdict(unslottedBundledDiff).blocked, /introduces 1 vulnerability finding\(s\)[^\n]*:\n {2}minimatch moderate 7\.0\.0 - 11\.0\.0\(package-not-vulnerable-in-base\)← https:\/\/github\.com\/advisories\/GHSA-g3hv-75wg-m249$/)
  assert.deepEqual(unslottedBundledDiff.overlayRemediated.map((item) => item.name), ['brace-expansion', 'tar'])
  // 同名但多一個修補層範圍外的節點(一般相依帶進來的那一份)→ 整筆照舊嚴格。
  const hoisted = verdict(diffAuditFindings(lockedOverlayBase(), upgradeAudit('candidate', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, BUNDLED_TAR, { ...BUNDLED_BRACE_EXPANSION, nodes: ['node_modules/brace-expansion', 'node_modules/npm/node_modules/brace-expansion'] }]), { installedOverlayReceipt }))
  assert.match(hoisted.blocked, /introduces 1 vulnerability finding\(s\)[^\n]*:\n {2}brace-expansion high 4\.0\.0 - 5\.0\.11\(package-not-vulnerable-in-base\)/)
  // 範圍解析不了 → 當成含修補層版本(嚴格)。
  const unparsable = verdict(diffAuditFindings(lockedOverlayBase(), upgradeAudit('candidate', [npmMetavulnerability('high', ['minimatch', 'tar']), BUNDLED_MINIMATCH, { ...BUNDLED_TAR, via: [{ ...BUNDLED_TAR.via[0], range: '~7.5' }] }, BUNDLED_BRACE_EXPANSION]), { installedOverlayReceipt }))
  assert.match(unparsable.blocked, /introduces 1 vulnerability finding\(s\)[^\n]*:\n {2}tar high <=7\.5\.20\(package-not-vulnerable-in-base\)/)
  // slot 只認現行修補層的已驗 receipt:沒驗過、歷史版本、換套件一律 fail closed,不退回「不正規化」。
  for (const receipt of [
    { ...installedOverlayReceipt, status: 'applied' },
    { ...installedOverlayReceipt, version: '5.0.9' },
    { ...installedOverlayReceipt, secondaryPackage: 'lodash', secondaryTarget: 'node_modules/lodash' },
    null,
  ]) {
    assert.throws(() => diffAuditFindings(lockedOverlayBase(), pristineCandidate(), { installedOverlayReceipt: receipt }), /GOV-NPM-RUNTIME-001:npm bundled security overlay slots require the verified installed receipt of the current overlay/)
  }
})

const git = (cwd, args, input = undefined) => {
  const result = spawnSync('git', args, { cwd, input, encoding: input === undefined ? 'utf8' : null })
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout))
  return result.stdout
}

const fixtureLiveMainVerifier = (repository, expectedBaseSha, remote) => {
  const output = git(repository, ['ls-remote', '--exit-code', remote, 'refs/heads/main']).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  assert.equal(lines.length, 1)
  const [sha, ref, ...extra] = lines[0].split(/\s+/)
  assert.equal(extra.length, 0)
  assert.equal(ref, 'refs/heads/main')
  if (sha !== expectedBaseSha) {
    throw new Error(`GOV-UPGRADE-SOURCE-006: protected main moved after reconstruction:${expectedBaseSha}:${sha}`)
  }
  return sha
}

function rollbackFixture(label) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `upgrade-evidence-rollback-${label}-`)))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  mkdirSync(join(repo, 'governance'), { recursive: true })
  mkdirSync(join(repo, '.legacy-provider'), { recursive: true })
  mkdirSync(evidence)
  writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
  writeFileSync(join(repo, '.legacy-provider/OLD.md'), 'retired provider\n')
  git(repo, ['init', '--quiet'])
  git(repo, ['config', 'user.name', 'Fixture'])
  git(repo, ['config', 'user.email', 'fixture@example.invalid'])
  git(repo, ['add', '-A'])
  git(repo, ['commit', '--quiet', '-m', 'base'])
  const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
  const remote = join(root, 'remote.git')
  mkdirSync(remote)
  git(remote, ['init', '--quiet', '--bare'])
  git(repo, ['remote', 'add', 'origin', remote])
  git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])

  writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
  writeFileSync(join(repo, 'governance/setup.md'), 'new governance surface\n')
  rmSync(join(repo, '.legacy-provider/OLD.md'))
  git(repo, ['add', '-A'])
  const fixtureOperations = stagedUpgradeOperations(repo)
  const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames']))
  const actualTree = git(repo, ['write-tree']).trim()
  const poisonedTree = `${actualTree[0] === 'f' ? 'e' : 'f'}${actualTree.slice(1)}`
  const fixtureReceipt = {
    ...receipt,
    baseSha: fixtureBase,
    patchSha256: sha256(fixturePatch),
    treeSha256: poisonedTree,
    paths: fixtureOperations.map(item => item.path),
    operations: fixtureOperations,
  }
  writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
  writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
  git(repo, ['reset', '--hard', '--quiet', fixtureBase])
  return {
    authority,
    evidence,
    fixtureBase,
    fixtureOperations,
    fixturePatch,
    fixtureReceipt,
    repo,
    root,
  }
}

function assertRollbackRestored(fixture) {
  assert.equal(git(fixture.repo, ['rev-parse', 'HEAD']).trim(), fixture.fixtureBase)
  assert.equal(git(fixture.repo, ['status', '--porcelain=v1', '--untracked-files=all']).trim(), '')
  assert.equal(git(fixture.repo, ['diff', '--cached', '--name-only']).trim(), '')
  assert.equal(readFileSync(join(fixture.repo, 'governance/lock.json'), 'utf8'), '{"release":"old"}\n')
  assert.equal(readFileSync(join(fixture.repo, '.legacy-provider/OLD.md'), 'utf8'), 'retired provider\n')
  assert.equal(existsSync(join(fixture.repo, 'governance/setup.md')), false)
}

test('preverified writer rolls back A/M/D operations when post-apply tree verification fails', () => {
  const fixture = rollbackFixture('preverified')
  try {
    const verificationSha256 = upgradeVerificationSha256(fixture.fixtureReceipt, fixture.fixturePatch)
    assert.throws(() => applyPreverifiedUpgradeEvidence({
      repository: fixture.repo,
      evidenceDirectory: fixture.evidence,
      expectedBaseSha: fixture.fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixture.fixtureReceipt.patchSha256,
      expectedTreeSha: fixture.fixtureReceipt.treeSha256,
      expectedAuthoritySha256: fixture.fixtureReceipt.authoritySha256,
      expectedVerificationSha256: verificationSha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    }), /GOV-UPGRADE-TREE-002/)
    assertRollbackRestored(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('reconstruct-and-apply rolls back A/M/D operations when post-apply tree verification fails', async () => {
  const fixture = rollbackFixture('reconstruct')
  try {
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: fixture.repo,
      evidenceDirectory: fixture.evidence,
      expectedBaseSha: fixture.fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixture.fixtureReceipt.patchSha256,
      expectedTreeSha: fixture.fixtureReceipt.treeSha256,
      expectedAuthoritySha256: fixture.fixtureReceipt.authoritySha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
      reconstruct: async () => ({
        authority: fixture.authority,
        authoritySha256: fixture.fixtureReceipt.authoritySha256,
        operations: fixture.fixtureOperations,
        paths: fixture.fixtureReceipt.paths,
        patchBytes: fixture.fixturePatch,
        treeSha256: fixture.fixtureReceipt.treeSha256,
      }),
    }), /GOV-UPGRADE-TREE-002/)
    assertRollbackRestored(fixture)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('live protected-main readback rejects local and credential-bearing remotes before network access', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-live-main-remote-')))
  try {
    git(root, ['init', '--quiet'])
    git(root, ['remote', 'add', 'origin', join(root, 'local.git')])
    assert.throws(
      () => assertLiveProtectedMain(root, '0'.repeat(40), 'origin'),
      /GOV-UPGRADE-SOURCE-006: live-main remote URL is invalid/,
    )
    git(root, ['remote', 'set-url', 'origin', 'https://user:secret@github.com/ajenchen/design-system.git'])
    assert.throws(
      () => assertLiveProtectedMain(root, '0'.repeat(40), 'origin'),
      /GOV-UPGRADE-SOURCE-006: live-main remote must be one credential-free canonical GitHub HTTPS URL/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('sync-all exact-target plan is syntax-only and cannot claim immutable-release readiness', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sync-all-plan-readiness-')))
  const script = join(import.meta.dirname, 'sync-all.mjs')
  try {
    const dependencies = {
      '@qijenchen/design-system': '1.0.0',
      '@qijenchen/storybook-config': '1.0.0',
    }
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({
      name: 'plan-readiness-fixture',
      private: true,
      dependencies,
    }, null, 2)}\n`)
    writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify({
      name: 'plan-readiness-fixture',
      lockfileVersion: 3,
      packages: {
        '': { name: 'plan-readiness-fixture', dependencies },
        'node_modules/@qijenchen/design-system': { version: '1.0.0' },
        'node_modules/@qijenchen/storybook-config': { version: '1.0.0' },
      },
    }, null, 2)}\n`)

    for (const target of ['2.0.0', '9999.0.0']) {
      const result = spawnSync(process.execPath, ['--', script, '--to', target, '--json'], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.notEqual(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.mode, 'plan')
      assert.equal(report.ok, false)
      assert.equal(report.mutationAuthorized, false)
      assert.equal(report.syntaxValid, true)
      assert.equal(report.targetVerification, 'deferred')
      assert.equal(report.targetVerified, false)
      assert.equal(report.ready, false)
      assert.ok(report.diagnostics.some(item => (
        item.ruleId === 'GOV-UPGRADE-VERIFICATION-001'
        && /immutable release/.test(item.message)
        && /live mutation 前 fail closed/.test(item.message)
      )))
    }

    const text = spawnSync(process.execPath, ['--', script, '--to', '2.0.0'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.notEqual(text.status, 0, text.stderr)
    assert.match(text.stdout, /targetVerification=deferred/)
    assert.match(text.stdout, /targetVerified=false/)
    assert.match(text.stdout, /ready=false/)
    assert.doesNotMatch(text.stdout, /Apply on a clean upgrade branch/)

    const invalid = spawnSync(process.execPath, ['--', script, '--to', 'latest', '--json'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.notEqual(invalid.status, 0, invalid.stderr)
    const invalidReport = JSON.parse(invalid.stdout)
    assert.equal(invalidReport.ok, false)
    assert.equal(invalidReport.syntaxValid, false)
    assert.equal(invalidReport.targetVerified, false)
    assert.equal(invalidReport.ready, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('read-only reconstruction digest gates the fresh preverified writer', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-writer-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(join(repo, 'governance'), { recursive: true })
    mkdirSync(evidence)
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    const remote = join(root, 'remote.git')
    mkdirSync(remote)
    git(remote, ['init', '--quiet', '--bare'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
    git(repo, ['add', '-A'])
    const fixtureOperations = stagedUpgradeOperations(repo)
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])

    const reconstruct = async () => ({
      authority,
      authoritySha256: fixtureReceipt.authoritySha256,
      operations: fixtureOperations,
      paths: fixtureReceipt.paths,
      patchBytes: fixturePatch,
      treeSha256: fixtureTree,
    })
    const result = await verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      reconstruct,
      verificationOnly: true,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    })
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
    assert.throws(() => applyPreverifiedUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      expectedVerificationSha256: 'e'.repeat(64),
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    }), /GOV-UPGRADE-EVIDENCE-008/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
    applyPreverifiedUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      expectedVerificationSha256: result.verificationSha256,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
    })
    assert.equal(result.treeSha256, fixtureTree)
    assert.equal(readFileSync(join(repo, 'governance/lock.json'), 'utf8'), '{"release":"new"}\n')
    assert.deepEqual(stagedUpgradeOperations(repo), fixtureOperations)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('live main movement during long reconstruction fails before writer mutation', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-main-move-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(join(repo, 'governance'), { recursive: true })
    mkdirSync(evidence)
    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"old"}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    const remote = join(root, 'remote.git')
    mkdirSync(remote)
    git(remote, ['init', '--quiet', '--bare'])
    git(repo, ['remote', 'add', 'origin', remote])
    git(repo, ['push', '--quiet', 'origin', 'HEAD:main'])

    writeFileSync(join(repo, 'governance/lock.json'), '{"release":"new"}\n')
    git(repo, ['add', '-A'])
    const fixtureOperations = stagedUpgradeOperations(repo)
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), `${JSON.stringify(fixtureReceipt, null, 2)}\n`)
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])

    const updater = join(root, 'updater')
    git(root, ['clone', '--quiet', '--branch', 'main', remote, updater])
    git(updater, ['config', 'user.name', 'Updater'])
    git(updater, ['config', 'user.email', 'updater@example.invalid'])
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      verificationOnly: true,
      liveMainRemote: 'origin',
      liveMainVerifier: fixtureLiveMainVerifier,
      reconstruct: async () => {
        writeFileSync(join(updater, 'main-moved.txt'), 'new main\n')
        git(updater, ['add', '-A'])
        git(updater, ['commit', '--quiet', '-m', 'move main'])
        git(updater, ['push', '--quiet', 'origin', 'HEAD:main'])
        return {
          authority,
          authoritySha256: fixtureReceipt.authoritySha256,
          operations: fixtureOperations,
          paths: fixtureReceipt.paths,
          patchBytes: fixturePatch,
          treeSha256: fixtureTree,
        }
      },
    }), /GOV-UPGRADE-SOURCE-006: protected main moved after reconstruction/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('reconstruction mismatch blocks before the writer checkout is mutated', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'upgrade-evidence-mismatch-')))
  const repo = join(root, 'repo')
  const evidence = join(root, 'evidence')
  try {
    mkdirSync(repo)
    mkdirSync(evidence)
    writeFileSync(join(repo, 'package.json'), '{}\n')
    git(repo, ['init', '--quiet'])
    git(repo, ['config', 'user.name', 'Fixture'])
    git(repo, ['config', 'user.email', 'fixture@example.invalid'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()
    writeFileSync(join(repo, 'governance.json'), '{}\n')
    git(repo, ['add', '-A'])
    const fixturePatch = Buffer.from(git(repo, ['diff', '--cached', '--binary', '--full-index', '--no-ext-diff', '--no-renames']))
    const fixtureTree = git(repo, ['write-tree']).trim()
    const fixtureOperations = stagedUpgradeOperations(repo)
    const takeoverAuthority = {
      ...authority,
      previousMaterialization: { exactPaths: [], pathPrefixes: [] },
      incomingMaterialization: { exactPaths: ['governance.json'], pathPrefixes: [] },
    }
    const fixtureReceipt = {
      ...receipt,
      baseSha: fixtureBase,
      patchSha256: sha256(fixturePatch),
      treeSha256: fixtureTree,
      paths: fixtureOperations.map(item => item.path),
      operations: fixtureOperations,
      authoritySha256: upgradeAuthoritySha256(takeoverAuthority),
    }
    writeFileSync(join(evidence, 'upgrade.patch'), fixturePatch)
    writeFileSync(join(evidence, 'receipt.json'), JSON.stringify(fixtureReceipt))
    git(repo, ['reset', '--hard', '--quiet', fixtureBase])
    await assert.rejects(() => verifyAndApplyUpgradeEvidence({
      repository: repo,
      evidenceDirectory: evidence,
      expectedBaseSha: fixtureBase,
      expectedVersion: version,
      expectedPatchSha256: fixtureReceipt.patchSha256,
      expectedTreeSha: fixtureTree,
      expectedAuthoritySha256: fixtureReceipt.authoritySha256,
      reconstruct: async () => ({
        authority: takeoverAuthority,
        authoritySha256: fixtureReceipt.authoritySha256,
        operations: fixtureOperations,
        paths: fixtureReceipt.paths,
        patchBytes: Buffer.from('different reconstruction'),
        treeSha256: fixtureTree,
      }),
    }), /certifier patch differs/)
    assert.equal(git(repo, ['status', '--porcelain']).trim(), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// 2026-11-26(產品 canary 缺陷 1):升級交易把 apps/*/package.json 的受管相依改成目標版號。這些檔不在 DS
// 受管清單裡,授權只認「重建時逐檔驗證過只改版號」的 workspace manifest,而且只認修改(M)。
test('workspace manifests are upgrade authority only when listed and only for modification', () => {
  const workspaceAuthority = { ...authority, workspaceDependencyManifests: ['apps/order-dashboard/package.json', 'apps/template/package.json'] }
  assert.equal(validateUpgradeOperations([
    { path: 'apps/order-dashboard/package.json', status: 'M' },
    { path: 'apps/template/package.json', status: 'M' },
    { path: 'governance/lock.json', status: 'M' },
  ], workspaceAuthority).length, 3)
  // 對照組:同一個 manifest 沒被列進授權 → 擋(以前的行為)
  assert.throws(
    () => validateUpgradeOperations([{ path: 'apps/order-dashboard/package.json', status: 'M' }], authority),
    /not retained governance authority/,
  )
  for (const status of ['A', 'D']) {
    assert.throws(
      () => validateUpgradeOperations([{ path: 'apps/template/package.json', status }], workspaceAuthority),
      /GOV-UPGRADE-PATH-007/,
      `${status} must stay outside workspace dependency authority`,
    )
  }
  assert.throws(
    () => validateUpgradeOperations([{ path: 'apps/order-dashboard/src/InvoiceTable.tsx', status: 'M' }], workspaceAuthority),
    /not retained governance authority/,
    'a listed manifest never widens to the rest of the app',
  )
  for (const invalid of [['package.json'], ['apps/b/package.json', 'apps/a/package.json'], ['apps/a/node_modules/x/package.json'], ['apps/a/README.md']]) {
    assert.throws(
      () => validateUpgradeOperations([{ path: 'governance/lock.json', status: 'M' }], { ...authority, workspaceDependencyManifests: invalid }),
      /workspace dependency manifests/,
      JSON.stringify(invalid),
    )
  }
  assert.notEqual(upgradeAuthoritySha256(workspaceAuthority), upgradeAuthoritySha256(authority), 'the workspace list is bound into the authority digest')
})

test('staged workspace manifests are verified as dependency-version-only changes', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'workspace-manifest-authority-')))
  try {
    const repo = join(root, 'consumer')
    mkdirSync(join(repo, 'apps/order-dashboard'), { recursive: true })
    mkdirSync(join(repo, 'apps/template'), { recursive: true })
    const stale = '0.1.0-beta.149'
    const target = '0.1.0-beta.151'
    const manifest = (name, version, extra = {}) => `${JSON.stringify({
      name,
      private: true,
      scripts: { dev: 'vite' },
      dependencies: { '@qijenchen/design-system': version, react: '^19.0.0' },
      ...extra,
    }, null, 2)}\n`
    writeFileSync(join(repo, 'package.json'), `${JSON.stringify({ name: 'consumer', private: true, workspaces: ['apps/*'], dependencies: { '@qijenchen/design-system': stale } }, null, 2)}\n`)
    writeFileSync(join(repo, 'apps/order-dashboard/package.json'), manifest('@product/order-dashboard', stale))
    writeFileSync(join(repo, 'apps/template/package.json'), manifest('@product/template', stale))
    git(repo, ['init', '--quiet'])
    git(repo, ['add', '-A'])
    git(repo, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'base'])
    const fixtureBase = git(repo, ['rev-parse', 'HEAD']).trim()

    writeFileSync(join(repo, 'apps/order-dashboard/package.json'), manifest('@product/order-dashboard', target))
    writeFileSync(join(repo, 'apps/template/package.json'), manifest('@product/template', target))
    git(repo, ['add', '-A'])
    assert.deepEqual(
      stagedWorkspaceDependencyManifests(repo, fixtureBase, target, stagedUpgradeOperations(repo)),
      ['apps/order-dashboard/package.json', 'apps/template/package.json'],
    )

    // 對照組:同一個 manifest 順手多改一個 script → 不是只改版號,拒絕
    writeFileSync(join(repo, 'apps/order-dashboard/package.json'), manifest('@product/order-dashboard', target, { scripts: { dev: 'vite', postinstall: 'node steal.js' } }))
    git(repo, ['add', '-A'])
    assert.throws(
      () => stagedWorkspaceDependencyManifests(repo, fixtureBase, target, stagedUpgradeOperations(repo)),
      /changed more than its governed dependency versions/,
    )
    // 對照組:改到別的版號 → 拒絕
    writeFileSync(join(repo, 'apps/order-dashboard/package.json'), manifest('@product/order-dashboard', '0.1.0-beta.150'))
    git(repo, ['add', '-A'])
    assert.throws(
      () => stagedWorkspaceDependencyManifests(repo, fixtureBase, target, stagedUpgradeOperations(repo)),
      /does not pin every governed package/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// 2026-11-28 錨例(0.1.0-beta.153 候選 e39ac6ea):受管檔 .node-version 放在產品 repo 根目錄,而產品升級時跑的是
// 「上一版」的 sync-all(scripts/sync-all.mjs 的 TRANSACTION_PATHS 與 incoming managed path 檢查),整筆以 GOV-UPGRADE-008
// 「incoming managed path is outside fixed transaction authority」中止 —— 只改新版的清單救不了這一跳。
// 所以這裡同時對「現行」與「上一個已發布版」兩份 TRANSACTION_PATHS 驗受管清單與共用 launcher 位置。
test('every shipped managed file stays inside the current and the last released sync-all transaction authority', () => {
  const repoRoot = join(import.meta.dirname, '..')
  const transactionRoots = (source, label) => {
    const match = /const TRANSACTION_PATHS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(source)
    assert.ok(match, `${label}: scripts/sync-all.mjs 找不到 TRANSACTION_PATHS(儀器失效)`)
    const roots = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
    assert.ok(roots.length > 0, `${label}: TRANSACTION_PATHS 是空的(儀器失效)`)
    return roots
  }
  const outside = (paths, roots) => paths.filter((path) => !roots.some((root) => path === root || path.startsWith(`${root}/`)))
  const gitOut = (args) => {
    const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, `git ${args.join(' ')} 失敗(讀不到上一個發布版 = 儀器失效,不是通過):${String(result.stderr).trim()}`)
    return result.stdout
  }
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'packages/design-system/ds-canonical/fork/manifest.json'), 'utf8'))
  const shipped = [...Object.keys(manifest.consumer.managedFiles), manifest.consumer.launcherDestination]
  assert.ok(shipped.length > 10, '受管清單少得不合理(儀器失效)')
  const lastRelease = gitOut(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']).trim()
  const authorities = {
    current: transactionRoots(readFileSync(join(repoRoot, 'scripts/sync-all.mjs'), 'utf8'), 'current'),
    [lastRelease]: transactionRoots(gitOut(['show', `${lastRelease}:scripts/sync-all.mjs`]), lastRelease),
  }
  for (const [label, roots] of Object.entries(authorities)) {
    assert.deepEqual(outside(shipped, roots), [], `${label} 的 sync-all 會以 GOV-UPGRADE-008 拒收這些受管檔`)
    // 對照組:錨例的根目錄受管檔必須被這一份清單指名(證明判定在該紅時會紅,不是恆綠)
    assert.deepEqual(outside([...shipped, '.node-version'], roots), ['.node-version'], `${label}: 根目錄受管檔沒被抓到`)
  }
})
