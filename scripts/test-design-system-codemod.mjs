#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { extract as extractTar } from '../node_modules/npm/node_modules/tar/dist/esm/index.js'
import {
  applyCodemodProposal,
  checkCodemodProposal,
  planCodemod,
} from '../packages/design-system/tools/codemods/index.mjs'
import {
  applyAtomicOperations,
  compareUtf8Bytes,
  sha256,
  stableStringify,
} from '../packages/design-system/tools/shared/safe-filesystem.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NPM_CLI = join(REPO_ROOT, 'node_modules/npm/bin/npm-cli.js')

function execNpmSync(args, options) {
  return execFileSync(process.execPath, [NPM_CLI, ...args], options)
}

function withAdversarialLocaleCompare(locale, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'localeCompare')
  assert.ok(descriptor)
  const collator = new Intl.Collator(locale, { usage: 'sort', sensitivity: 'variant' })
  Object.defineProperty(String.prototype, 'localeCompare', {
    ...descriptor,
    value(other) {
      return collator.compare(String(this), String(other))
    },
  })
  try {
    return callback()
  } finally {
    Object.defineProperty(String.prototype, 'localeCompare', descriptor)
  }
}

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'design-system-codemod-'))
  for (const [path, body] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }
  return root
}

test('Unicode codemod paths and proposal digests use UTF-8 byte order under adversarial Intl locales', () => {
  const root = fixture({
    'src/ä-blocker.tsx': 'export const UmlautBlocker = () => <Input mode="display" />\n',
    'src/ä-input.tsx': `import { Input } from '@qijenchen/design-system'
export const UmlautInput = () => <Input mode="display" />
`,
    'src/z-blocker.tsx': 'export const ZBlocker = () => <Input mode="display" />\n',
    'src/z-input.tsx': `import { Input } from '@qijenchen/design-system'
export const ZInput = () => <Input mode="display" />
`,
  })
  const names = ['z-input.tsx', 'ä-input.tsx']
  const locales = ['en-US', 'sv-SE']
  const localeOrders = locales.map((locale) => [...names].sort(new Intl.Collator(locale).compare))
  assert.notDeepEqual(localeOrders[0], localeOrders[1])

  const proposals = locales.map((locale) => withAdversarialLocaleCompare(
    locale,
    () => planCodemod({ repoRoot: root, sourceRoots: ['src'] }),
  ))
  assert.deepEqual(proposals[0], proposals[1])
  assert.equal(proposals[0].proposalDigest, proposals[1].proposalDigest)

  const expectedInventoryPaths = [
    'src/ä-blocker.tsx',
    'src/ä-input.tsx',
    'src/z-blocker.tsx',
    'src/z-input.tsx',
  ].sort(compareUtf8Bytes)
  assert.deepEqual(proposals[0].inventory.map((row) => row.path), expectedInventoryPaths)
  assert.deepEqual(
    proposals[0].files.map((row) => row.path),
    ['src/ä-input.tsx', 'src/z-input.tsx'].sort(compareUtf8Bytes),
  )
  assert.deepEqual(
    proposals[0].blockers.map((row) => row.path),
    ['src/ä-blocker.tsx', 'src/z-blocker.tsx'].sort(compareUtf8Bytes),
  )
  assert.deepEqual(
    Object.keys(JSON.parse(stableStringify({ 'ä-key': true, 'z-key': true }))),
    ['z-key', 'ä-key'],
  )
})

test('beta.84 migration transforms only AST-bound design-system APIs and is idempotent', () => {
  const root = fixture({
    'src/direct.tsx': `import { BulkActionBar as Bar, ButtonGroup, DescriptionList, Input, DatePickerRange, type DescriptionDirection } from '@qijenchen/design-system'
type Direction = DescriptionDirection
export const Example = () => <><Bar onClear={() => {}} selection={[]} actions={[]} /><ButtonGroup direction="vertical"/><DescriptionList direction="horizontal"/><Input mode="display"/><DatePickerRange mode={'display'}/></>
`,
    'src/alias.ts': `import type { DescriptionDirection as LegacyDirection } from '@qijenchen/design-system/components/DescriptionList'
export type KeptLocalAlias = LegacyDirection
`,
    'src/namespace.tsx': `import * as DS from '@qijenchen/design-system'
export type Direction = DS.DescriptionDirection
export const Example = () => <DS.Input mode="display" />
`,
    'src/unrelated.tsx': `const onClear = () => {}
export const Local = () => <LocalInput mode="display" onClear={onClear} />
`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src/direct.tsx', 'src/alias.ts', 'src/namespace.tsx'] })
  assert.equal(proposal.blockers.length, 0)
  assert.equal(proposal.files.length, 3)
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal }), /planned but not applied/)
  assert.equal(applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }).state, 'applied')
  assert.match(readFileSync(join(root, 'src/direct.tsx'), 'utf8'), /onClearSelection/)
  assert.match(readFileSync(join(root, 'src/direct.tsx'), 'utf8'), /orientation="vertical"/)
  assert.match(readFileSync(join(root, 'src/direct.tsx'), 'utf8'), /mode="view"/)
  assert.doesNotMatch(readFileSync(join(root, 'src/direct.tsx'), 'utf8'), /DescriptionDirection/)
  assert.match(readFileSync(join(root, 'src/alias.ts'), 'utf8'), /DescriptionListOrientation as LegacyDirection/)
  assert.match(readFileSync(join(root, 'src/namespace.tsx'), 'utf8'), /DS\.DescriptionListOrientation/)
  assert.equal(checkCodemodProposal({ repoRoot: root, proposal }).state, 'applied')
  const second = planCodemod({ repoRoot: root, sourceRoots: ['src/direct.tsx', 'src/alias.ts', 'src/namespace.tsx'] })
  assert.equal(second.files.length, 0)
  assert.equal(second.blockers.length, 0)
})

test('ambiguous wrappers, dynamic display mode, and DataTable meta.disabled fail loud without edits', () => {
  const root = fixture({
    'src/ambiguous.tsx': `export const A = () => <BulkActionBar onClear={() => {}} />
export const B = () => <Input mode={ready ? 'display' : 'edit'} />
const column = { meta: { disabled: true } }
`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  assert.deepEqual(new Set(proposal.blockers.map((row) => row.rule)), new Set([
    'unresolved-component-binding',
    'datatable-meta-disabled-manual',
  ]))
  assert.equal(proposal.files.length, 0)
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal }), /manual blocker/)
  assert.throws(
    () => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }),
    /manual blocker/,
  )
})

test('directly bound dynamic display expressions are manual blockers', () => {
  const root = fixture({
    'src/dynamic.tsx': `import { Input } from '@qijenchen/design-system'
export const A = () => <Input mode={ready ? 'display' : 'edit'} />
`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  assert.equal(proposal.blockers[0]?.rule, 'field-mode-dynamic')
})

test('direct component JSX spreads and legacy React.createElement props fail loud', () => {
  const root = fixture({
    'src/legacy.tsx': `import { BulkActionBar, Input } from '@qijenchen/design-system'
import * as DS from '@qijenchen/design-system'
const fieldProps = { mode: 'display' as const }
export const A = () => <Input {...fieldProps} />
export const B = () => React.createElement(BulkActionBar, { onClear() {}, selection: [], actions: [] })
const LegacyInput = Input
export const C = () => <LegacyInput mode="display" />
const { Input: DestructuredInput } = DS
const BracketInput = DS['Input']
export const D = () => <><DestructuredInput mode="display" /><BracketInput mode="display" /></>
`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  assert.deepEqual(new Set(proposal.blockers.map((row) => row.rule)), new Set([
    'component-props-spread-manual',
    'react-create-element-props-manual',
    'component-binding-escape-manual',
  ]))
  assert.equal(proposal.files.length, 0)
})

test('source inventory and proposal digest reject rogue and concurrent changes', () => {
  const root = fixture({
    'src/a.tsx': `import { Input } from '@qijenchen/design-system'
export const A = () => <Input mode="display" />
`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  const forged = structuredClone(proposal)
  forged.files[0].edits[0].to = 'forged'
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal: forged }), /digest is invalid/)
  writeFileSync(join(root, 'src/a.tsx'), `${readFileSync(join(root, 'src/a.tsx'), 'utf8')}// concurrent\n`)
  assert.throws(
    () => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }),
    /neither the before nor after image/,
  )
  writeFileSync(join(root, 'src/new.ts'), 'export const rogue = true\n')
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal }), /gained, lost, or renamed/)
})

test('same bytes with a concurrent mode change cannot satisfy a planned codemod image', () => {
  const root = fixture({
    'src/a.tsx': `import { Input } from '@qijenchen/design-system'\nexport const A = () => <Input mode="display" />\n`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  chmodSync(join(root, 'src/a.tsx'), 0o700)
  assert.throws(() => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }), /mode changed/)
})

test('source traversal rejects symbolic-link poison', () => {
  const outside = fixture({ 'outside.ts': 'export const outside = true\n' })
  const root = fixture({ 'src/a.ts': 'export const a = true\n' })
  symlinkSync(outside, join(root, 'src/poison'))
  assert.throws(() => planCodemod({ repoRoot: root, sourceRoots: ['src'] }), /symbolic link/)
})

test('an existing transaction lock excludes a second codemod writer without partial mutation', () => {
  const root = fixture({
    'src/a.tsx': `import { Input } from '@qijenchen/design-system'\nexport const A = () => <Input mode="display" />\n`,
  })
  const proposal = planCodemod({ repoRoot: root, sourceRoots: ['src'] })
  const before = readFileSync(join(root, 'src/a.tsx'))
  writeFileSync(join(root, '.qijenchen-ds-codemod.lock'), 'first-writer\n')
  assert.throws(() => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }), /another tool transaction is active/)
  assert.deepEqual(readFileSync(join(root, 'src/a.tsx')), before)
  unlinkSync(join(root, '.qijenchen-ds-codemod.lock'))
  assert.equal(applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }).state, 'applied')
})

test('shared multi-file writer rolls back exact before-images after a mid-publication failure', () => {
  const root = fixture({ 'a.ts': 'before-a\n', 'b.ts': 'before-b\n' })
  const beforeA = Buffer.from('before-a\n')
  const beforeB = Buffer.from('before-b\n')
  const afterA = Buffer.from('after-a\n')
  const afterB = Buffer.from('after-b\n')
  assert.throws(() => applyAtomicOperations({
    root,
    fail: (message) => { throw new Error(message) },
    lockName: '.fixture.lock',
    operations: [
      { action: 'replace', path: 'a.ts', beforeSha256: sha256(beforeA), beforeMode: 0o644, afterSha256: sha256(afterA), afterBytes: afterA, mode: 0o644 },
      { action: 'replace', path: 'b.ts', beforeSha256: sha256(beforeB), beforeMode: 0o644, afterSha256: sha256(afterB), afterBytes: afterB, mode: 0o644 },
    ],
    afterOperation: ({ index }) => { if (index === 0) throw new Error('fixture publication failure') },
  }), /fixture publication failure/)
  assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), 'before-a\n')
  assert.equal(readFileSync(join(root, 'b.ts'), 'utf8'), 'before-b\n')
})

test('post-commit backup or lock cleanup failures never roll applied targets back', () => {
  for (const fault of ['backup-cleanup', 'lock-release']) {
    const root = fixture({ 'a.ts': 'before-a\n' })
    const before = Buffer.from('before-a\n')
    const after = Buffer.from('after-a\n')
    const mode = lstatSync(join(root, 'a.ts')).mode & 0o777
    assert.throws(() => applyAtomicOperations({
      root,
      fail: (message) => { throw new Error(message) },
      lockName: '.fixture.lock',
      operations: [
        { action: 'replace', path: 'a.ts', beforeSha256: sha256(before), beforeMode: mode, afterSha256: sha256(after), afterBytes: after, mode },
      ],
      ...(fault === 'backup-cleanup'
        ? { beforeBackupCleanup: () => { throw new Error('injected backup cleanup failure') } }
        : { beforeLockRelease: () => { throw new Error('injected lock release failure') } }),
    }), /atomic transaction committed but (?:before-image cleanup|lock release) failed/)
    assert.deepEqual(readFileSync(join(root, 'a.ts')), after)
    assert.equal(lstatSync(join(root, 'a.ts')).mode & 0o777, mode)
    assert.equal(readFileSync(join(root, '.fixture.lock'), 'utf8').trim(), String(process.pid))
    const backups = readdirSync(root).filter((name) => name.startsWith('.qijenchen-before-'))
    assert.equal(backups.length, fault === 'backup-cleanup' ? 1 : 0)
    unlinkSync(join(root, '.fixture.lock'))
  }
})

test('packed npm archive exposes both CLIs and executes against an isolated exact dependency fixture', () => {
  const staging = mkdtempSync(join(tmpdir(), 'design-system-packed-cli-'))
  const packed = JSON.parse(execNpmSync(['pack', './packages/design-system', '--json', '--pack-destination', staging], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  }))[0]
  const packageRoot = join(staging, 'runtime/node_modules/@qijenchen/design-system')
  mkdirSync(packageRoot, { recursive: true })
  extractTar({ file: join(staging, packed.filename), cwd: packageRoot, strip: 1, sync: true })
  const runtimeModules = join(staging, 'runtime/node_modules')
  cpSync(join(REPO_ROOT, 'node_modules/typescript'), join(runtimeModules, 'typescript'), { recursive: true })
  cpSync(join(REPO_ROOT, 'node_modules/pngjs'), join(runtimeModules, 'pngjs'), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies.typescript, '5.9.3')
  assert.equal(manifest.dependencies.pngjs, '7.0.0')
  assert.equal(manifest.bin['qijenchen-ds-codemod'], './tools/codemods/cli.mjs')
  assert.equal(manifest.bin['qijenchen-ds-visual-baseline'], './tools/visual-baseline/cli.mjs')

  const consumer = join(staging, 'runtime/consumer')
  mkdirSync(join(consumer, 'src'), { recursive: true })
  const binRoot = join(consumer, 'node_modules/.bin')
  mkdirSync(binRoot, { recursive: true })
  for (const [name, path] of Object.entries(manifest.bin)) {
    symlinkSync(relative(binRoot, join(packageRoot, path)), join(binRoot, name))
  }
  writeFileSync(join(consumer, 'src/app.tsx'), `import { Input } from '@qijenchen/design-system'\nexport const App = () => <Input mode="display" />\n`)
  execNpmSync(['exec', '--offline', '--', 'qijenchen-ds-codemod', 'beta.84-breaking-api', 'plan', '--root', consumer, '--source', 'src', '--output', 'codemod.json'], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  })
  const codemod = JSON.parse(readFileSync(join(consumer, 'codemod.json'), 'utf8'))
  assert.equal(codemod.typescriptVersion, '5.9.3')
  assert.equal(codemod.files.length, 1)

  const image = new PNG({ width: 1, height: 1 })
  image.data.set([10, 20, 30, 255])
  mkdirSync(join(consumer, 'candidate'))
  mkdirSync(join(consumer, 'baseline'))
  writeFileSync(join(consumer, 'candidate/image.png'), PNG.sync.write(image))
  image.data.set([30, 20, 10, 255])
  writeFileSync(join(consumer, 'baseline/image.png'), PNG.sync.write(image))
  writeFileSync(join(consumer, 'statements.json'), `${JSON.stringify({ 'image.png': 'Changed the reviewed foreground and contrast.' })}\n`)
  execFileSync('git', ['init', '--quiet'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/qijenchen-fixtures/packed-cli.git'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['add', '--', 'src', 'candidate', 'baseline', 'statements.json'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.name=Packed CLI Fixture', '-c', 'user.email=packed-cli@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'packed cli base'], { cwd: consumer, stdio: 'pipe' })
  execNpmSync(['exec', '--offline', '--', 'qijenchen-ds-visual-baseline', 'plan', '--root', consumer, '--author', 'clean-room-author', '--candidate', 'candidate', '--baseline', 'baseline', '--statements', 'statements.json', '--output', 'visual.json'], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  })
  const visual = JSON.parse(readFileSync(join(consumer, 'visual.json'), 'utf8'))
  assert.equal(visual.pngParserVersion, 'pngjs@7.0.0')
  assert.equal(visual.reviewTrust.status, 'not-activated')
  assert.throws(() => execNpmSync(['exec', '--offline', '--', 'qijenchen-ds-visual-baseline', 'check', '--root', consumer, '--proposal', 'visual.json'], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  }), (error) => {
    assert.equal(error.status, 1)
    assert.match(error.stderr.toString('utf8'), /pending visual changes require --review/)
    return true
  })
})
