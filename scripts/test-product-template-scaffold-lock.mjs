#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_JSON_SCHEMA,
  PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR,
  PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND,
  assertProductTemplateScaffoldLockSchemaMirror,
  buildProductTemplateScaffoldLock,
  productTemplatePackageLockNpmArgs,
  validateProductTemplateScaffoldLock,
  verifyProductTemplateScaffold,
} from './product-template-scaffold-lock.mjs'
import { generateProductTemplatePackageLock } from './generate-product-template-package-lock.mjs'
import {
  assertRuntimeDependencyClosureDirectory,
  assertRuntimeDependencyClosureEntries,
  relativeRuntimeImports,
} from './lib/runtime-dependency-closure.mjs'
import { publishedCompatibilitySourcePaths } from './lib/published-template-provider-surfaces.mjs'

const version = '1.2.3-beta.4'
const sri = value => `sha512-${createHash('sha512').update(value).digest('base64')}`
const temporary = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'product-template-scaffold-'))
  temporary.push(root)
  const write = (path, body, mode = 0o644) => {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
    chmodSync(absolute, mode)
  }
  write('package.json', `${JSON.stringify({
    name: 'ds-product-template', version: '0.0.0', workspaces: ['apps/*'],
    dependencies: { '@qijenchen/design-system': version, '@qijenchen/storybook-config': version },
    devDependencies: { typescript: '5.9.3' }, engines: { node: '>=22' },
  }, null, 2)}\n`)
  write('apps/template/package.json', `${JSON.stringify({
    name: '@product/template', version: '0.0.0',
    dependencies: { '@qijenchen/design-system': version },
  }, null, 2)}\n`)
  write('apps/template/src/main.ts', 'export {}\n')
  write('scripts/create-app.mjs', '#!/usr/bin/env node\n', 0o755)
  return { root, write }
}

test.after(() => {
  for (const root of temporary) rmSync(root, { recursive: true, force: true })
})

test('schema mirror and deterministic byte-sorted full static inventory are closed', () => {
  assert.equal(assertProductTemplateScaffoldLockSchemaMirror(), true)
  const { root, write } = fixture()
  write('docs/\uE000.md', 'bmp\n')
  write('docs/\u{10000}.md', 'non-bmp\n')
  const first = buildProductTemplateScaffoldLock({ root, releaseVersion: version })
  const second = buildProductTemplateScaffoldLock({ root, releaseVersion: version })
  assert.deepEqual(first, second)
  assert.equal(first.publishedPathCount, first.entries.length + 1)
  assert.deepEqual(first.entries.map(item => item.path), [
    'apps/template/package.json',
    'apps/template/src/main.ts',
    'docs/\uE000.md',
    'docs/\u{10000}.md',
    'package.json',
    'scripts/create-app.mjs',
  ])
  assert.equal(first.entries.find(item => item.path === 'scripts/create-app.mjs').mode, '755')
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  assert.equal(ajv.validate(PRODUCT_TEMPLATE_SCAFFOLD_LOCK_JSON_SCHEMA, first), true, JSON.stringify(ajv.errors))
})

test('lock declaration and executable package-lock generator share one exact npm argv authority', async () => {
  const prefix = '/tmp/reviewed-product-template'
  const observed = []
  const result = await generateProductTemplatePackageLock({
    prefix,
    npmRunner: async ({ args }) => {
      observed.push([...args])
      return { status: 'passed', npm: 'fixture' }
    },
  })
  assert.deepEqual(observed, [[
    PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND[0],
    '--prefix',
    prefix,
    ...PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND.slice(1),
  ]])
  assert.deepEqual(result.args, productTemplatePackageLockNpmArgs(prefix))
  assert.equal(result.generator, PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR)
  assert.equal(PRODUCT_TEMPLATE_GENERATED_ENTRIES[0].generator, PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR)
  await assert.rejects(
    generateProductTemplatePackageLock({ prefix, npmRunner: async () => ({ status: 'failed' }) }),
    /did not report success/,
  )
})

test('source and published phases close exact path, bytes and mode inventories', () => {
  const { root, write } = fixture()
  const lock = buildProductTemplateScaffoldLock({ root, releaseVersion: version })
  assert.equal(verifyProductTemplateScaffold({ root, lock, phase: 'source' }).entries.length, lock.entries.length)

  write('package-lock.json', `${JSON.stringify({
    name: 'ds-product-template', version: '0.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': {
        name: 'ds-product-template', version: '0.0.0', workspaces: ['apps/*'],
        dependencies: { '@qijenchen/design-system': version, '@qijenchen/storybook-config': version },
        devDependencies: { typescript: '5.9.3' }, engines: { node: '>=22' },
      },
      'apps/template': {
        name: '@product/template', version: '0.0.0',
        dependencies: { '@qijenchen/design-system': version },
      },
      'node_modules/@qijenchen/design-system': { version, resolved: `https://registry.npmjs.org/@qijenchen/design-system/-/design-system-${version}.tgz`, integrity: sri('design-system') },
      'node_modules/@qijenchen/storybook-config': { version, resolved: `https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-${version}.tgz`, integrity: sri('storybook-config') },
    },
  }, null, 2)}\n`)
  const releaseBom = {
    releaseVersion: version,
    packages: [
      { name: '@qijenchen/design-system', version, integrity: sri('design-system') },
      { name: '@qijenchen/storybook-config', version, integrity: sri('storybook-config') },
    ],
  }
  assert.equal(verifyProductTemplateScaffold({ root, lock, phase: 'published', releaseBom }).entries.length, lock.publishedPathCount)
  assert.throws(() => verifyProductTemplateScaffold({ root, lock, phase: 'source' }), /undeclared scaffold path|expected .* published paths/)
})

for (const [label, mutate, pattern] of [
  ['static byte tamper', ({ write }) => write('apps/template/src/main.ts', 'tampered\n'), /bytes\/mode drifted/],
  ['unexpected file', ({ write }) => write('backdoor.sh', 'exit 0\n', 0o755), /expected .* published paths|undeclared scaffold path/],
  ['static mode tamper', ({ root }) => chmodSync(join(root, 'apps/template/src/main.ts'), 0o755), /bytes\/mode drifted/],
  ['generated path injected before generation', ({ write }) => write('package-lock.json', '{}\n'), /already contains generated path/],
]) {
  test(`rejects ${label}`, () => {
    const context = fixture()
    const lock = label === 'generated path injected before generation'
      ? null
      : buildProductTemplateScaffoldLock({ root: context.root, releaseVersion: version })
    mutate(context)
    if (lock) assert.throws(() => verifyProductTemplateScaffold({ root: context.root, lock, phase: 'source' }), pattern)
    else assert.throws(() => buildProductTemplateScaffoldLock({ root: context.root, releaseVersion: version }), pattern)
  })
}

test('rejects source symlinks and open/colliding lock shapes', () => {
  const { root } = fixture()
  const rootAlias = `${root}-alias`
  temporary.push(rootAlias)
  symlinkSync(root, rootAlias, 'dir')
  assert.throws(() => buildProductTemplateScaffoldLock({ root: rootAlias, releaseVersion: version }), /root must be a real directory/)
  symlinkSync('main.ts', join(root, 'apps/template/src/alias.ts'))
  assert.throws(() => buildProductTemplateScaffoldLock({ root, releaseVersion: version }), /contains symlink/)

  const clean = fixture()
  const lock = buildProductTemplateScaffoldLock({ root: clean.root, releaseVersion: version })
  assert.throws(() => validateProductTemplateScaffoldLock({ ...lock, extra: true }), /open or incomplete shape/)
  const collision = structuredClone(lock)
  collision.generatedEntries[0].path = collision.entries[0].path
  assert.throws(() => validateProductTemplateScaffoldLock(collision), /duplicates a static path/)
})

test('rejects generated package-lock identity and release SRI drift', () => {
  const { root, write } = fixture()
  const lock = buildProductTemplateScaffoldLock({ root, releaseVersion: version })
  write('package-lock.json', `${JSON.stringify({
    name: 'ds-product-template', version: '0.0.0', lockfileVersion: 3,
    packages: {
      '': {
        name: 'ds-product-template', version: '0.0.0', workspaces: ['apps/*'],
        dependencies: { '@qijenchen/design-system': version, '@qijenchen/storybook-config': version },
        devDependencies: { typescript: '5.9.3' }, engines: { node: '>=22' },
      },
      'apps/template': {
        name: '@product/template', version: '0.0.0',
        dependencies: { '@qijenchen/design-system': version },
      },
      'node_modules/@qijenchen/design-system': { version, resolved: `https://registry.npmjs.org/@qijenchen/design-system/-/design-system-${version}.tgz`, integrity: sri('wrong') },
      'node_modules/@qijenchen/storybook-config': { version, resolved: `https://registry.npmjs.org/@qijenchen/storybook-config/-/storybook-config-${version}.tgz`, integrity: sri('storybook-config') },
    },
  }, null, 2)}\n`)
  assert.throws(() => verifyProductTemplateScaffold({
    root, lock, phase: 'published',
    releaseBom: {
      releaseVersion: version,
      packages: [
        { name: '@qijenchen/design-system', version, integrity: sri('design-system') },
        { name: '@qijenchen/storybook-config', version, integrity: sri('storybook-config') },
      ],
    },
  }), /differs from release BOM version\/SRI\/canonical registry/)
})

test('published and fork runtime delivery reject a missing nested relative dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'product-runtime-closure-'))
  temporary.push(root)
  const write = (path, body) => {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, body)
  }
  write('scripts/main.mjs', "import './lib/bridge.mjs'\n")
  write('scripts/lib/bridge.mjs', "export { value } from './nested/leaf.mjs'\n")
  write('scripts/lib/nested/leaf.mjs', 'export const value = true\n')
  const complete = assertRuntimeDependencyClosureDirectory(root, {
    label: 'published-template runtime delivery fixture',
    scanRoots: ['scripts'],
  })
  assert.equal(complete.runtimeModuleCount, 3)
  assert.equal(complete.edgeCount, 2)
  rmSync(join(root, 'scripts/lib/nested/leaf.mjs'))
  assert.throws(
    () => assertRuntimeDependencyClosureDirectory(root, {
      label: 'published-template runtime delivery fixture',
      scanRoots: ['scripts'],
    }),
    /scripts\/lib\/bridge\.mjs -> \.\/nested\/leaf\.mjs/,
  )

  const authenticatedManagedFiles = new Map([
    ['scripts/main.mjs', "import './lib/bridge.cjs'\n"],
    ['scripts/lib/bridge.cjs', "module.exports = require('./nested/missing.cjs')\n"],
  ])
  assert.throws(
    () => assertRuntimeDependencyClosureEntries(authenticatedManagedFiles, {
      label: 'fork authenticated consumer runtime delivery fixture',
    }),
    /scripts\/lib\/bridge\.cjs -> \.\/nested\/missing\.cjs/,
  )
})

test('runtime dependency closure cannot hide literal imports behind legal comments', () => {
  const poisonCases = [
    ['dynamic import block comment', "import(/* transport */ './dynamic-missing.mjs')\n", './dynamic-missing.mjs'],
    ['export-from line comment', "export { value } from // transport\n './export-missing.mjs'\n", './export-missing.mjs'],
    ['CommonJS require block comment', "module.exports = require(/* transport */ './require-missing.cjs')\n", './require-missing.cjs'],
  ]
  for (const [label, source, specifier] of poisonCases) {
    assert.deepEqual(relativeRuntimeImports(source), [{
      kind: label.startsWith('CommonJS') ? 'cjs' : 'esm',
      specifier,
    }], label)
    assert.throws(
      () => assertRuntimeDependencyClosureEntries(new Map([['scripts/main.mjs', source]]), {
        label: `comment-separated ${label}`,
      }),
      /has missing relative runtime dependencies/,
      label,
    )
  }
})

test('published compatibility sources omit empty categories but retain every declared leaf', () => {
  const manifest = {
    consumer: {
      compatibilityCategories: [
        { destinationRoot: '.claude/agents', entries: [] },
        { destinationRoot: '.claude/commands', entries: [] },
      ],
    },
  }
  assert.deepEqual(publishedCompatibilitySourcePaths(manifest), [])
  manifest.consumer.compatibilityCategories[0].entries = ['reviewer.md']
  assert.deepEqual(publishedCompatibilitySourcePaths(manifest), [
    'template/ds-product-template/.claude/agents/reviewer.md',
  ])
})

test('actual clean-room mirror closes every generated provider/fork scaffold file', () => {
  const base = mkdtempSync(join(tmpdir(), 'product-template-clean-room-'))
  temporary.push(base)
  const mirror = join(base, 'mirror')
  const built = spawnSync(process.execPath, ['--', 'scripts/build-published-template-mirror.mjs', `--out=${mirror}`], {
    cwd: process.cwd(), encoding: 'utf8',
  })
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const lock = buildProductTemplateScaffoldLock({ root: mirror, releaseVersion: '1.2.3' })
  assert.ok(lock.entries.length > 100, 'actual mirror inventory unexpectedly small')
  assert.equal(verifyProductTemplateScaffold({ root: mirror, lock, phase: 'source' }).entries.length, lock.entries.length)
  for (const [label, mutate, pattern] of [
    ['paired provider bytes', root => writeFileSync(join(root, 'AGENTS.md'), '# attacker override\n'), /bytes\/mode drifted/],
    ['executable-bit substitution', root => chmodSync(join(root, 'CLAUDE.md'), 0o755), /bytes\/mode drifted/],
    ['undeclared provider file', root => writeFileSync(join(root, '.codex/override.toml'), 'approval_policy="never"\n'), /expected .* published paths|undeclared scaffold path/],
    ['symlink escape', root => symlinkSync('../package.json', join(root, 'apps/escape.json')), /contains symlink/],
  ]) {
    const attacked = join(base, label.replaceAll(' ', '-'))
    cpSync(mirror, attacked, { recursive: true })
    mutate(attacked)
    assert.throws(() => verifyProductTemplateScaffold({ root: attacked, lock, phase: 'source' }), pattern, label)
  }
})

test('release and fresh-writer workflows keep the scaffold provenance chain wired', () => {
  const release = readFileSync('.github/workflows/release.yml', 'utf8')
  const finalizer = readFileSync('.github/workflows/release-finalize.yml', 'utf8')
  const mirror = readFileSync('.github/workflows/mirror-to-published-template.yml', 'utf8')
  const finalVerifier = readFileSync('scripts/verify-mirror-evidence.mjs', 'utf8')
  for (const [label, workflow] of [['release builder', release], ['release finalizer', finalizer]]) {
    const build = workflow.indexOf('build-published-template-mirror.mjs')
    const lock = workflow.indexOf('product-template-scaffold-lock.mjs', build)
    const bom = workflow.indexOf('build-release-bom.mjs', lock)
    assert.ok(build >= 0 && build < lock && lock < bom, `${label} does not build scaffold lock before BOM`)
  }
  assert.match(release, /subject-path:[\s\S]*product-template-scaffold\.lock\.json/)
  assert.match(mirror, /node source\/scripts\/generate-product-template-package-lock\.mjs --prefix "\$MIRROR"/)
  assert.doesNotMatch(mirror, /npm install --global|\bnpx\s+-y\b/)
  assert.match(mirror, /gh release download[\s\S]*--pattern release-bom\.json[\s\S]*--pattern product-template-scaffold\.lock\.json/)
  assert.match(mirror, /--pre-extract[\s\S]*tar --no-same-owner[\s\S]*node trusted\/scripts\/verify-mirror-evidence\.mjs/)
  const verifierPublishedScaffold = finalVerifier.indexOf('verifyProductTemplateScaffold({ root: mirror')
  const verifierReceiptTree = finalVerifier.indexOf('MIRROR-EVIDENCE-005', verifierPublishedScaffold)
  const verifierSetupSnapshot = finalVerifier.indexOf('assertCommittedSetupSnapshot(mirror)', verifierReceiptTree)
  assert.ok(
    verifierPublishedScaffold >= 0
      && verifierPublishedScaffold < verifierReceiptTree
      && verifierReceiptTree < verifierSetupSnapshot,
    'final verifier must close published scaffold -> receipt-bound tree -> committed setup snapshot',
  )
  const sourceVerify = mirror.indexOf('--phase source')
  const certifyActivationProof = mirror.indexOf('node trusted/scripts/verify-mirror-activation-boundary.mjs')
  const lockfileGeneration = mirror.indexOf('node source/scripts/generate-product-template-package-lock.mjs --prefix "$MIRROR"')
  const publishedVerify = mirror.indexOf('--phase published', sourceVerify)
  const proofEvidenceCopy = mirror.indexOf('mirror-activation-boundary-proof.json" "$EVIDENCE/mirror-activation-boundary-proof.json', publishedVerify)
  const evidenceReceipt = mirror.indexOf('{schemaVersion:4', publishedVerify)
  const receiptProofBinding = mirror.indexOf('activationBoundaryProofSha256:$activation', evidenceReceipt)
  const envelopeVerify = mirror.indexOf('verify-mirror-evidence.mjs', evidenceReceipt)
  const extractedVerify = mirror.indexOf('verify-mirror-evidence.mjs', envelopeVerify + 1)
  const writerActivationProof = mirror.indexOf('node trusted/scripts/verify-mirror-activation-boundary.mjs', certifyActivationProof + 1)
  const writerProofReadback = mirror.indexOf('cmp -s "$FRESH_PROOF" "$ARTIFACT_PROOF"', writerActivationProof)
  const targetEvidenceReadback = mirror.indexOf('verify-mirror-evidence.mjs', extractedVerify + 1)
  const targetReadback = mirror.indexOf('--allow-git-metadata', targetEvidenceReadback)
  const indexEvidenceReadback = mirror.indexOf('verify-mirror-evidence.mjs', targetEvidenceReadback + 1)
  const liveMutationBoundary = mirror.indexOf('Prove live mutation boundaries before requesting write credentials', indexEvidenceReadback)
  const sourceBoundary = mirror.indexOf('--repository "$GITHUB_REPOSITORY"', liveMutationBoundary)
  const targetBoundary = mirror.indexOf('--repository ajenchen/ds-product-template', sourceBoundary)
  const token = mirror.indexOf('actions/create-github-app-token@', targetBoundary)
  assert.equal((mirror.match(/--activation-boundary-proof-sha256/g) ?? []).length, 3)
  assert.equal((mirror.match(/--activation-proof "\$RUNNER_TEMP\/mirror-evidence\/mirror-activation-boundary-proof\.json"/g) ?? []).length, 2)
  assert.equal((mirror.match(/--release-source-root "\$GITHUB_WORKSPACE\/release-source"/g) ?? []).length, 3)
  assert.ok(
    certifyActivationProof >= 0 && certifyActivationProof < sourceVerify
      && sourceVerify < lockfileGeneration
      && lockfileGeneration < publishedVerify && publishedVerify < evidenceReceipt
      && publishedVerify < proofEvidenceCopy && proofEvidenceCopy < evidenceReceipt
      && evidenceReceipt < receiptProofBinding && receiptProofBinding < writerActivationProof
      && writerActivationProof < writerProofReadback && writerProofReadback < envelopeVerify
      && envelopeVerify < extractedVerify && extractedVerify < targetEvidenceReadback
      && targetEvidenceReadback < targetReadback && targetReadback < indexEvidenceReadback
      && indexEvidenceReadback < liveMutationBoundary && liveMutationBoundary < sourceBoundary
      && sourceBoundary < targetBoundary && targetBoundary < token,
    'mirror workflow no longer closes signed activation -> source -> generated lockfile -> receipt v4 -> safe extraction -> exact target/index readback -> live boundaries before credentials',
  )
})
