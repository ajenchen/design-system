#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import ts from 'typescript'
import {
  CANONICAL_PRODUCT_WORKSPACES,
  TRUSTED_PRODUCT_CHECK_FILES,
  TRUSTED_PRODUCT_RUNTIME_FILES,
  validateConsumerSource,
  verifyTrustedProductChecks,
} from './consumer-source-harness.mjs'

function fixture(source) {
  const repo = mkdtempSync(join(tmpdir(), 'consumer-source-harness-'))
  const write = (path, body) => {
    const target = join(repo, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }
  write('package.json', JSON.stringify({ private: true, workspaces: ['apps/*'], scripts: { build: 'npm run build --workspaces', typecheck: 'tsc -b' } }))
  write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: false }, include: [], exclude: ['apps/**'] }))
  write('apps/example/package.json', JSON.stringify({ name: '@product/example', private: true, scripts: { build: 'tsc -b && vite build', typecheck: 'tsc --noEmit' } }))
  write('apps/example/src/main.ts', source)
  return { repo, write }
}

test('base-owned harness ignores candidate tsconfig exclusions and rejects invalid source', () => {
  const { repo } = fixture('const value: string = 123\n')
  assert.throws(() => validateConsumerSource({ repo, typescriptModule: ts, build: false }), /exhaustive TypeScript harness failed/)
})

test('base-owned harness typechecks executable workspace files outside src as part of the closed build set', () => {
  const value = fixture('export const value: string = "ok"\n')
  value.write('apps/example/vite.config.ts', 'const invalid: string = 123\nexport default invalid\n')
  assert.throws(
    () => validateConsumerSource({ repo: value.repo, typescriptModule: ts, build: false }),
    /exhaustive TypeScript harness failed/,
  )
})

test('generated-directory names cannot hide nested product source', () => {
  const value = fixture('export const value: string = "ok"\n')
  value.write('apps/example/src/build/hidden.ts', 'const invalid: string = 123\nexport default invalid\n')
  assert.throws(
    () => validateConsumerSource({ repo: value.repo, typescriptModule: ts, build: false }),
    /exhaustive TypeScript harness failed/,
  )
})

test('base-owned harness rejects candidate workspace build-command downgrade', () => {
  const { repo, write } = fixture('export const value: string = "ok"\n')
  write('apps/example/package.json', JSON.stringify({ name: '@product/example', private: true, scripts: { build: 'echo trivial-output', typecheck: 'tsc --noEmit' } }))
  assert.throws(() => validateConsumerSource({ repo, typescriptModule: ts, build: false }), /workspace apps\/example build must equal the protected command/)
})

test('the actual canonical product manifest requires every workspace build', () => {
  const canonical = JSON.parse(readFileSync(resolve('template/ds-product-template/package.json'), 'utf8'))
  assert.deepEqual(canonical.workspaces, [...CANONICAL_PRODUCT_WORKSPACES])
  const { repo, write } = fixture('export const value: string = "ok"\n')
  write('package.json', JSON.stringify(canonical))
  assert.deepEqual(
    validateConsumerSource({ repo, typescriptModule: ts, build: false }),
    { workspaces: ['apps/example'], sourceFiles: 1, built: false },
  )
})

test('candidate-controlled workspace roots cannot hide product source from the trusted harness', () => {
  for (const workspaces of [[], ['fixtures/*'], ['apps/*', 'fixtures/*']]) {
    const value = fixture('export const value: string = "ok"\n')
    value.write('package.json', JSON.stringify({
      private: true,
      workspaces,
      scripts: { build: 'npm run build --workspaces', typecheck: 'tsc -b' },
    }))
    assert.throws(
      () => validateConsumerSource({ repo: value.repo, typescriptModule: ts, build: false }),
      workspaces.length ? /consumer workspaces must equal the protected product roots/ : /nonempty workspaces/,
    )
  }
})

test('base-owned harness rejects --if-present at both root and workspace boundaries', () => {
  const root = fixture('export const value: string = "ok"\n')
  root.write('package.json', JSON.stringify({
    private: true,
    workspaces: ['apps/*'],
    scripts: { build: 'npm run build --workspaces --if-present', typecheck: 'tsc -b' },
  }))
  assert.throws(
    () => validateConsumerSource({ repo: root.repo, typescriptModule: ts, build: false }),
    /root build must equal the protected command/,
  )

  const workspace = fixture('export const value: string = "ok"\n')
  workspace.write('apps/example/package.json', JSON.stringify({
    name: '@product/example',
    private: true,
    scripts: { build: 'vite build --if-present', typecheck: 'tsc --noEmit' },
  }))
  assert.throws(
    () => validateConsumerSource({ repo: workspace.repo, typescriptModule: ts, build: false }),
    /workspace apps\/example build must equal the protected command/,
  )
})

test('closed product workspace set rejects hidden app directories and workspace identity shadows', () => {
  const hidden = fixture('export const value: string = "ok"\n')
  hidden.write('apps/hidden/src/main.ts', 'export const hidden = true\n')
  assert.throws(
    () => validateConsumerSource({ repo: hidden.repo, typescriptModule: ts, build: false }),
    /canonical workspace directory has no package.json/,
  )

  const shadow = fixture('export const value: string = "ok"\n')
  shadow.write('apps/example/package.json', JSON.stringify({
    name: 'typescript',
    private: true,
    scripts: { build: 'tsc -b && vite build', typecheck: 'tsc --noEmit' },
  }))
  assert.throws(
    () => validateConsumerSource({ repo: shadow.repo, typescriptModule: ts, build: false }),
    /private canonical workspace @product\/example/,
  )
})

test('workspace and source roots must be real directories, never symlink projections', () => {
  const workspaceLink = fixture('export const value: string = "ok"\n')
  workspaceLink.write('outside/package.json', JSON.stringify({
    name: '@product/example',
    private: true,
    scripts: { build: 'tsc -b && vite build', typecheck: 'tsc --noEmit' },
  }))
  workspaceLink.write('outside/src/main.ts', 'export const outside = true\n')
  rmSync(join(workspaceLink.repo, 'apps/example'), { recursive: true })
  symlinkSync(join(workspaceLink.repo, 'outside'), join(workspaceLink.repo, 'apps/example'), 'dir')
  assert.throws(
    () => validateConsumerSource({ repo: workspaceLink.repo, typescriptModule: ts, build: false }),
    /workspace entry may not be a symlink/,
  )

  const sourceLink = fixture('export const value: string = "ok"\n')
  sourceLink.write('outside-src/main.ts', 'export const outside = true\n')
  rmSync(join(sourceLink.repo, 'apps/example/src'), { recursive: true })
  symlinkSync(join(sourceLink.repo, 'outside-src'), join(sourceLink.repo, 'apps/example/src'), 'dir')
  assert.throws(
    () => validateConsumerSource({ repo: sourceLink.repo, typescriptModule: ts, build: false }),
    /workspace apps\/example src must be a real directory/,
  )
})

test('candidate build config cannot replace the protected lint helper executed after build', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'trusted-product-check-boundary-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const trusted = join(root, 'trusted')
  const candidate = join(root, 'candidate')
  const staged = join(trusted, '.governance-tools')

  for (const path of TRUSTED_PRODUCT_CHECK_FILES) {
    const destination = join(trusted, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(resolve(path), destination)
  }
  for (const path of TRUSTED_PRODUCT_RUNTIME_FILES) {
    const destination = join(trusted, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, path.endsWith('package.json') ? '{}\n' : `trusted runtime fixture:${path}\n`)
  }
  const stagedResult = spawnSync(process.execPath, [
    '--',
    resolve('scripts/consumer-source-harness.mjs'),
    '--stage-trusted-product-checks',
    staged,
    '--trusted',
    trusted,
  ], { encoding: 'utf8' })
  assert.equal(stagedResult.status, 0, stagedResult.stderr || stagedResult.stdout)
  assert.match(stagedResult.stdout, /trusted product checks staged/)
  const trustedLint = join(staged, 'scripts/lint-ds-internal-imports.mjs')
  const trustedLintBefore = readFileSync(trustedLint)

  mkdirSync(join(candidate, 'apps/example/src'), { recursive: true })
  mkdirSync(join(candidate, 'scripts'), { recursive: true })
  writeFileSync(
    join(candidate, 'apps/example/src/forbidden.ts'),
    "import '@qijenchen/design-system/src/private-entry'\n",
  )
  writeFileSync(join(candidate, 'scripts/lint-ds-internal-imports.mjs'), 'process.exit(1)\n')
  writeFileSync(
    join(candidate, 'apps/example/vite.config.mjs'),
    [
      "import { writeFileSync } from 'node:fs'",
      "writeFileSync(new URL('../../scripts/lint-ds-internal-imports.mjs', import.meta.url), \"console.log('candidate false green')\\n\")",
      '',
    ].join('\n'),
  )

  const candidateBuild = spawnSync(process.execPath, ['--', join(candidate, 'apps/example/vite.config.mjs')], {
    encoding: 'utf8',
  })
  assert.equal(candidateBuild.status, 0, candidateBuild.stderr)
  assert.match(readFileSync(join(candidate, 'scripts/lint-ds-internal-imports.mjs'), 'utf8'), /candidate false green/)
  const verifiedResult = spawnSync(process.execPath, [
    '--',
    resolve('scripts/consumer-source-harness.mjs'),
    '--verify-trusted-product-checks',
    staged,
    '--trusted',
    trusted,
  ], { encoding: 'utf8' })
  assert.equal(verifiedResult.status, 0, verifiedResult.stderr || verifiedResult.stdout)
  assert.match(verifiedResult.stdout, /trusted product checks verified/)
  assert.deepEqual(
    verifyTrustedProductChecks({ trustedRoot: trusted, outputRoot: staged }),
    { tools: TRUSTED_PRODUCT_CHECK_FILES.length, runtime: TRUSTED_PRODUCT_RUNTIME_FILES.length },
  )
  assert.deepEqual(readFileSync(trustedLint), trustedLintBefore)

  const protectedLint = spawnSync(process.execPath, ['--', trustedLint, '--repo', candidate], {
    encoding: 'utf8',
  })
  assert.equal(protectedLint.status, 1, protectedLint.stderr || protectedLint.stdout)
  assert.match(protectedLint.stderr, /apps\/example\/src\/forbidden\.ts/)
  assert.doesNotMatch(`${protectedLint.stdout}\n${protectedLint.stderr}`, /candidate false green/)
})
