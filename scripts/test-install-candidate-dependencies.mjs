import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installCandidateDependencies } from './install-candidate-dependencies.mjs'
import { runVerifiedNpm } from './run-verified-npm.mjs'

const exactNpm = {
  version: '11.18.0',
  resolved: 'https://registry.npmjs.org/npm/-/npm-11.18.0.tgz',
  integrity: 'sha512-T67M4L5wNm0cZ7EBLErcEkY1SmzEW/WJ+SADBzsFUY1UdAPfFHXFQtZ6SEXiK0+vzXysCvAsepbMaBTwnrAD+w==',
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
}

function repository(path) {
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(path, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\n')
  writeFileSync(join(path, 'package.json'), `{"name":"fixture","version":"1.0.0","devDependencies":{"npm":"${exactNpm.version}"}}\n`)
  writeFileSync(join(path, 'package-lock.json'), `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '1.0.0', devDependencies: { npm: exactNpm.version } },
      'node_modules/npm': {
        ...exactNpm,
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
    },
  })}\n`)
  git(path, ['init', '-q'])
  git(path, ['add', '.'])
  git(path, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'])
}

function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'candidate-deps-'))
  const trusted = join(workspace, 'trusted')
  const candidate = join(workspace, 'candidate')
  repository(trusted)
  repository(candidate)
  return { workspace, trusted, candidate }
}

test('candidate dependency install uses one verified exact runtime and closed lifecycle-disabled argv', async () => {
  const { workspace, trusted } = fixture()
  const calls = []
  let cleaned = 0
  const result = await installCandidateDependencies({
    trustedRoot: trusted,
    workspaceRoot: workspace,
    candidatePath: 'candidate',
    environment: { PATH: process.env.PATH, GITHUB_WORKSPACE: workspace },
    runtimeFactory: async ({ repositoryRoot }) => {
      assert.equal(repositoryRoot, realpathSync(trusted))
      return {
        artifact: exactNpm,
        cli: join(trusted, 'verified-npm.cjs'),
        toolchain: { npm: exactNpm.version },
        cleanup: () => { cleaned += 1 },
      }
    },
    runner(command, args, options) {
      calls.push({ command, args, options })
      return { status: 0 }
    },
  })
  assert.equal(result.npm, '11.18.0')
  assert.equal(cleaned, 1)
  assert.deepEqual(calls.map(({ args }) => args.slice(1)), [
    ['ci', '--legacy-peer-deps', '--ignore-scripts', '--registry=https://registry.npmjs.org/'],
    ['audit', 'signatures', '--registry=https://registry.npmjs.org/'],
    ['audit', '--audit-level=high', '--registry=https://registry.npmjs.org/'],
  ])
  for (const call of calls) {
    assert.equal(call.command, process.execPath)
    assert.equal(call.options.shell, false)
    assert.equal(call.options.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true')
    assert.equal(call.options.env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/')
    assert.notEqual(call.options.env.NPM_CONFIG_USERCONFIG, undefined)
    assert.notEqual(call.options.env.NPM_CONFIG_GLOBALCONFIG, undefined)
  }
})

test('candidate dependency install rejects workspace escape and symlink substitution', async () => {
  const { workspace, trusted, candidate } = fixture()
  await assert.rejects(
    installCandidateDependencies({ trustedRoot: trusted, workspaceRoot: workspace, candidatePath: '../escape' }),
    /candidate escapes|ENOENT/,
  )
  symlinkSync(candidate, join(workspace, 'candidate-link'))
  await assert.rejects(
    installCandidateDependencies({ trustedRoot: trusted, workspaceRoot: workspace, candidatePath: 'candidate-link' }),
    /candidate must be a real directory/,
  )
})

test('candidate dependency install rejects a root shrinkwrap before acquiring or executing npm', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  let runtimeFactoryCalled = false
  let runnerCalled = false
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
      runner: () => {
        runnerCalled = true
        return { status: 0 }
      },
    }),
    /npm-shrinkwrap\.json is forbidden/,
  )
  assert.equal(runtimeFactoryCalled, false)
  assert.equal(runnerCalled, false)
})

test('candidate dependency install rejects project npm config injection before acquiring npm', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, '.npmrc'), 'legacy-peer-deps=true\nignore-scripts=true\ncache=./candidate-controlled-cache\n')
  let runtimeFactoryCalled = false
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
    }),
    /\.npmrc must contain only the canonical settings/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('candidate dependency install rejects a fake verified runtime and always cleans it', async () => {
  const { workspace, trusted } = fixture()
  let cleaned = 0
  await assert.rejects(
    installCandidateDependencies({
      trustedRoot: trusted,
      workspaceRoot: workspace,
      candidatePath: 'candidate',
      runtimeFactory: async () => ({
        artifact: { ...exactNpm, integrity: 'sha512-AAAAAAAA' },
        cli: '/tmp/npm.cjs',
        toolchain: { npm: exactNpm.version },
        cleanup: () => { cleaned += 1 },
      }),
      runner: () => ({ status: 0 }),
    }),
    /verified npm 11\.18\.0 capability is required/,
  )
  assert.equal(cleaned, 1)
})

test('verified npm prefix operations reject a target shrinkwrap before runtime acquisition', async () => {
  const { workspace, trusted, candidate } = fixture()
  writeFileSync(join(candidate, 'npm-shrinkwrap.json'), '{"lockfileVersion":3,"packages":{}}\n')
  let runtimeFactoryCalled = false
  let runnerCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: [
        'ci',
        '--prefix',
        candidate,
        '--ignore-scripts',
        '--legacy-peer-deps',
      ],
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
      runner: () => {
        runnerCalled = true
        return { status: 0 }
      },
    }),
    /npm-shrinkwrap\.json is forbidden/,
  )
  assert.equal(runtimeFactoryCalled, false)
  assert.equal(runnerCalled, false)
})

test('verified npm rejects a prefix symlink escape before runtime acquisition', async () => {
  const { workspace, trusted } = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-outside-'))
  mkdirSync(join(outside, 'candidate'))
  symlinkSync(outside, join(workspace, 'escape'))
  let runtimeFactoryCalled = false
  let runnerCalled = false
  try {
    await assert.rejects(
      runVerifiedNpm({
        root: trusted,
        environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
        args: [
          'ci',
          '--prefix',
          join(workspace, 'escape', 'candidate'),
          '--ignore-scripts',
          '--legacy-peer-deps',
        ],
        runtimeFactory: async () => {
          runtimeFactoryCalled = true
          return null
        },
        runner: () => {
          runnerCalled = true
          return { status: 0 }
        },
      }),
      /prefix contains a symlink or escapes RUNNER_TEMP/,
    )
    assert.equal(runtimeFactoryCalled, false)
    assert.equal(runnerCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm rejects RUNNER_TEMP itself as a prefix before runtime acquisition', async () => {
  const { workspace, trusted } = fixture()
  let runtimeFactoryCalled = false
  await assert.rejects(
    runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: workspace },
      args: ['audit', '--prefix', workspace, '--audit-level=high'],
      runtimeFactory: async () => {
        runtimeFactoryCalled = true
        return null
      },
    }),
    /prefix must be a strict RUNNER_TEMP descendant/,
  )
  assert.equal(runtimeFactoryCalled, false)
})

test('verified npm canonicalizes an allowed RUNNER_TEMP alias but rejects aliases below it', async () => {
  const { workspace, trusted, candidate } = fixture()
  const aliasParent = mkdtempSync(join(tmpdir(), 'verified-npm-alias-'))
  const runnerAlias = join(aliasParent, 'runner')
  symlinkSync(workspace, runnerAlias)
  const calls = []
  let cleaned = 0
  try {
    const result = await runVerifiedNpm({
      root: trusted,
      environment: { PATH: process.env.PATH, RUNNER_TEMP: runnerAlias },
      args: [
        'ci',
        '--prefix',
        join(runnerAlias, 'candidate'),
        '--ignore-scripts',
        '--legacy-peer-deps',
      ],
      runtimeFactory: async () => ({
        cli: join(trusted, 'verified-npm.cjs'),
        toolchain: { npm: exactNpm.version },
        cleanup: () => { cleaned += 1 },
      }),
      runner(command, args, options) {
        calls.push({ command, args, options })
        return { status: 0 }
      },
    })
    assert.equal(result.status, 'passed')
    assert.equal(cleaned, 1)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].args[calls[0].args.indexOf('--prefix') + 1], realpathSync(candidate))
  } finally {
    rmSync(aliasParent, { recursive: true, force: true })
  }
})

test('verified npm pack rejects a missing or symlinked release destination before runtime acquisition', async () => {
  const { trusted } = fixture()
  mkdirSync(join(trusted, 'packages', 'design-system'), { recursive: true })
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-pack-outside-'))
  const args = [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ]
  let runtimeFactoryCalled = false
  const options = {
    root: trusted,
    environment: { PATH: process.env.PATH },
    args,
    runtimeFactory: async () => {
      runtimeFactoryCalled = true
      return null
    },
  }
  try {
    await assert.rejects(runVerifiedNpm(options), /npm pack destination must exist as a real directory/)
    assert.equal(runtimeFactoryCalled, false)

    symlinkSync(outside, join(trusted, 'release-artifacts'))
    await assert.rejects(runVerifiedNpm(options), /npm pack destination must be a real non-symlink directory/)
    assert.equal(runtimeFactoryCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm pack rejects symlinked sources and destination entries before runtime acquisition', async () => {
  const { trusted } = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'verified-npm-pack-entry-outside-'))
  mkdirSync(join(trusted, 'packages'), { recursive: true })
  mkdirSync(join(trusted, 'release-artifacts'))
  mkdirSync(join(outside, 'design-system'))
  writeFileSync(join(outside, 'archive.tgz'), 'outside\n')
  symlinkSync(join(outside, 'design-system'), join(trusted, 'packages', 'design-system'))
  const args = [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ]
  let runtimeFactoryCalled = false
  const options = {
    root: trusted,
    environment: { PATH: process.env.PATH },
    args,
    runtimeFactory: async () => {
      runtimeFactoryCalled = true
      return null
    },
  }
  try {
    await assert.rejects(runVerifiedNpm(options), /npm pack source must be a real non-symlink directory/)
    assert.equal(runtimeFactoryCalled, false)

    rmSync(join(trusted, 'packages', 'design-system'))
    mkdirSync(join(trusted, 'packages', 'design-system'))
    symlinkSync(join(outside, 'archive.tgz'), join(trusted, 'release-artifacts', 'archive.tgz'))
    await assert.rejects(runVerifiedNpm(options), /npm pack destination contains an unsafe entry:archive\.tgz/)
    assert.equal(runtimeFactoryCalled, false)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('verified npm pack accepts only the canonical real release destination', async () => {
  const { trusted } = fixture()
  mkdirSync(join(trusted, 'packages', 'design-system'), { recursive: true })
  mkdirSync(join(trusted, 'release-artifacts'))
  const calls = []
  let cleaned = 0
  const result = await runVerifiedNpm({
    root: trusted,
    environment: { PATH: process.env.PATH },
    args: [
      'pack',
      './packages/design-system',
      '--pack-destination',
      'release-artifacts',
      '--json',
      '--ignore-scripts',
    ],
    runtimeFactory: async () => ({
      cli: join(trusted, 'verified-npm.cjs'),
      toolchain: { npm: exactNpm.version },
      cleanup: () => { cleaned += 1 },
    }),
    runner(command, args, options) {
      calls.push({ command, args, options })
      return { status: 0 }
    },
  })
  assert.equal(result.status, 'passed')
  assert.equal(cleaned, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.cwd, realpathSync(trusted))
  assert.deepEqual(calls[0].args.slice(1), [
    'pack',
    './packages/design-system',
    '--pack-destination',
    'release-artifacts',
    '--json',
    '--ignore-scripts',
  ])
})
