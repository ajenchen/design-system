#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compareExactSemver,
  parseExactSemver,
} from '../../../scripts/workflow-static-validation.mjs'

const MAX_MANIFEST_BYTES = 64 * 1024
const CLOSED_RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:beta|next|rc)\.(?:0|[1-9]\d*))?$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })
const PACKAGE_MANIFESTS = Object.freeze([
  Object.freeze({ name: '@qijenchen/design-system', path: 'packages/design-system/package.json' }),
  Object.freeze({ name: '@qijenchen/governance', path: 'packages/governance/package.json' }),
  Object.freeze({ name: '@qijenchen/storybook-config', path: 'packages/storybook-config/package.json' }),
])

function invariant(condition, message) {
  if (!condition) throw new Error(`GOVERNANCE-ANCHOR-VERSION-PROJECTION:${message}`)
}

function canonicalRoot(root, label) {
  invariant(typeof root === 'string' && root.length > 0, `${label} root must be non-empty`)
  const absolute = resolve(root)
  const info = lstatSync(absolute)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} root must be a real directory`)
  invariant(realpathSync(absolute) === absolute, `${label} root must have no symbolic-link ancestry`)
  return absolute
}

function assertContained(root, path, label) {
  const rel = relative(root, path)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('/'), `${label} escapes its repository root`)
  let current = root
  for (const segment of rel.split(sep).filter(Boolean)) {
    current = join(current, segment)
    const info = lstatSync(current)
    invariant(!info.isSymbolicLink(), `${label} crosses a symbolic link`)
  }
}

function sameStableFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function readCanonicalManifest(root, expected) {
  const path = resolve(root, expected.path)
  assertContained(root, path, `${expected.name} manifest`)
  const before = lstatSync(path, { bigint: true })
  invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, `${expected.name} manifest must be one regular file`)
  invariant(before.size > 0n && before.size <= BigInt(MAX_MANIFEST_BYTES), `${expected.name} manifest size is outside the closed limit`)
  const bytes = readFileSync(path)
  const after = lstatSync(path, { bigint: true })
  invariant(sameStableFile(before, after), `${expected.name} manifest changed while it was read`)
  let text
  let manifest
  try {
    text = UTF8.decode(bytes)
    manifest = JSON.parse(text)
  } catch (error) {
    throw new Error(`GOVERNANCE-ANCHOR-VERSION-PROJECTION:${expected.name} manifest must be UTF-8 JSON:${error.message}`, { cause: error })
  }
  invariant(manifest && typeof manifest === 'object' && !Array.isArray(manifest), `${expected.name} manifest root must be an object`)
  invariant(text === `${JSON.stringify(manifest, null, 2)}\n`, `${expected.name} manifest must use canonical JSON serialization`)
  invariant(manifest.name === expected.name, `${expected.path} has an unexpected package name`)
  invariant(CLOSED_RELEASE_VERSION.test(manifest.version ?? ''), `${expected.name} version is outside the closed release train`)
  parseExactSemver(manifest.version, { allowBuild: false })
  return Object.freeze({
    bytes,
    manifest: Object.freeze(manifest),
    mode: Number(before.mode & 0o777n),
    name: expected.name,
    path,
    repoPath: expected.path,
    version: manifest.version,
  })
}

function inspectRoot(root, label) {
  const canonical = canonicalRoot(root, label)
  const manifests = PACKAGE_MANIFESTS.map(expected => readCanonicalManifest(canonical, expected))
  const versions = new Set(manifests.map(manifest => manifest.version))
  invariant(versions.size === 1, `${label} package versions must be identical`)
  return Object.freeze({
    manifests: Object.freeze(manifests),
    root: canonical,
    version: manifests[0].version,
  })
}

export function inspectGovernanceAnchorVersionProjection({ trustedRoot, candidateRoot }) {
  const trusted = inspectRoot(trustedRoot, 'protected-base')
  const candidate = inspectRoot(candidateRoot, 'candidate')
  invariant(
    compareExactSemver(candidate.version, trusted.version) >= 0,
    `candidate version ${candidate.version} is older than protected-base version ${trusted.version}`,
  )
  return Object.freeze({
    candidate,
    projected: candidate.version !== trusted.version,
    trusted,
  })
}

function writeAtomic(path, bytes, mode) {
  const temporary = join(dirname(path), `.governance-anchor-version-${process.pid}-${randomUUID()}.tmp`)
  let descriptor
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      mode,
    )
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    chmodSync(temporary, mode)
    renameSync(temporary, path)
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temporary, { force: true })
    throw error
  }
}

function exactFileBytes(path, expected) {
  return readFileSync(path).equals(expected)
}

export function withGovernanceAnchorVersionProjection({ trustedRoot, candidateRoot, execute }) {
  invariant(typeof execute === 'function', 'execute callback is required')
  const plan = inspectGovernanceAnchorVersionProjection({ trustedRoot, candidateRoot })
  const trustedGovernance = plan.trusted.manifests.find(manifest => manifest.name === '@qijenchen/governance')
  invariant(trustedGovernance, 'protected-base governance manifest is missing')
  if (!plan.projected) return execute(plan)

  const backupRoot = mkdtempSync(join(tmpdir(), 'governance-anchor-version-'))
  const backupPath = join(backupRoot, 'package.json')
  writeFileSync(backupPath, trustedGovernance.bytes, { flag: 'wx', mode: 0o600 })
  invariant(exactFileBytes(backupPath, trustedGovernance.bytes), 'protected-base manifest backup readback failed')

  const projectedManifest = { ...trustedGovernance.manifest, version: plan.candidate.version }
  const projectedBytes = Buffer.from(`${JSON.stringify(projectedManifest, null, 2)}\n`)
  let executionResult
  let executionError
  let restoreError
  let restored = false
  try {
    assertContained(plan.trusted.root, trustedGovernance.path, 'protected-base governance manifest write target')
    writeAtomic(trustedGovernance.path, projectedBytes, trustedGovernance.mode)
    const projectedReadback = readCanonicalManifest(plan.trusted.root, PACKAGE_MANIFESTS[1])
    invariant(projectedReadback.version === plan.candidate.version, 'projected governance version readback failed')
    executionResult = execute(plan)
  } catch (error) {
    executionError = error
  }

  try {
    assertContained(plan.trusted.root, trustedGovernance.path, 'protected-base governance manifest restore target')
    writeAtomic(trustedGovernance.path, readFileSync(backupPath), trustedGovernance.mode)
    invariant(exactFileBytes(trustedGovernance.path, trustedGovernance.bytes), 'protected-base governance manifest was not restored byte-for-byte')
    restored = true
  } catch (error) {
    restoreError = new Error(`GOVERNANCE-ANCHOR-VERSION-PROJECTION:restore failed; recovery backup retained at ${backupPath}:${error.message}`, { cause: error })
  }
  if (restored) rmSync(backupRoot, { recursive: true, force: true })
  if (executionError && restoreError) throw new AggregateError([executionError, restoreError], 'Governance anchor execution and protected-base manifest restoration both failed')
  if (restoreError) throw restoreError
  if (executionError) throw executionError
  return executionResult
}

function parseCli(argv) {
  const allowed = new Set(['--trusted-root', '--candidate-root'])
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    invariant(allowed.has(flag), `unexpected argument ${String(flag)}`)
    invariant(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `${flag} requires one value`)
    invariant(!values.has(flag), `${flag} may be provided only once`)
    values.set(flag, value)
  }
  invariant(values.size === allowed.size, '--trusted-root and --candidate-root are required')
  return Object.freeze({
    candidateRoot: values.get('--candidate-root'),
    trustedRoot: values.get('--trusted-root'),
  })
}

export function runGovernanceAnchorVersionProjection(argv = process.argv.slice(2), { spawn = spawnSync } = {}) {
  const roots = parseCli(argv)
  return withGovernanceAnchorVersionProjection({
    ...roots,
    execute(plan) {
      console.log(
        `GOVERNANCE-ANCHOR-VERSION-PROJECTION protected-base-verifier=${plan.trusted.version} candidate-target-generator=${plan.candidate.version} projected=${plan.projected}`,
      )
      const governanceBin = resolve(plan.trusted.root, 'packages/governance/bin/governance.mjs')
      const result = spawn(process.execPath, [
        governanceBin,
        'check',
        '--repo', plan.candidate.root,
        '--role', 'ds-author',
        '--hooks-off',
      ], {
        cwd: plan.trusted.root,
        env: process.env,
        shell: false,
        stdio: 'inherit',
        windowsHide: true,
      })
      if (result.error) throw result.error
      if (result.status !== 0) {
        const error = new Error(`protected-base governance check failed with status ${String(result.status)}${result.signal ? ` (${result.signal})` : ''}`)
        error.exitCode = Number.isInteger(result.status) && result.status > 0 ? result.status : 1
        throw error
      }
      return plan
    },
  })
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    runGovernanceAnchorVersionProjection()
  } catch (error) {
    console.error(error.message)
    process.exitCode = error.exitCode ?? 1
  }
}
