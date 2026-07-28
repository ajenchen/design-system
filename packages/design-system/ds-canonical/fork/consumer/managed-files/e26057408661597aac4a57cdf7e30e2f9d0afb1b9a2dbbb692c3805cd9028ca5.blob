#!/usr/bin/env node
// Dependency-free, committed workflow data validator.
//
// Workflows may pass data to this CLI, but they must never pass JavaScript source
// through node -e/-p/--eval/--print or stdin. Keep every accepted operation and
// package field closed here so untrusted paths/values remain data, not code.

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_MANIFEST_BYTES = 1024 * 1024
const ALLOWED_DEPENDENCIES = new Set([
  '@qijenchen/design-system',
  '@qijenchen/storybook-config',
])

function invariant(condition, message) {
  if (!condition) throw new Error(`WF-STATIC-VALIDATION-001:${message}`)
}

function compareAscii(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

function compareNumericIdentifier(left, right) {
  return left.length - right.length || compareAscii(left, right)
}

function isNonCanonicalNumericIdentifier(identifier) {
  return identifier.length > 1 && identifier.startsWith('0')
}

export function parseExactSemver(value, {
  allowBuild = true,
  allowLegacyPrefix = false,
} = {}) {
  invariant(typeof value === 'string' && value.length > 0, 'semantic version must be a non-empty string')
  let candidate = value
  if (allowLegacyPrefix && /^[~^]/.test(candidate)) candidate = candidate.slice(1)
  const match = candidate.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/)
  invariant(match, `exact semantic version required; received ${JSON.stringify(value)}`)
  const core = match.slice(1, 4)
  const prerelease = match[4]?.split('.') ?? null
  const build = match[5]?.split('.') ?? null
  invariant(!core.some(isNonCanonicalNumericIdentifier), `non-canonical numeric core in ${JSON.stringify(value)}`)
  invariant(
    !prerelease?.some(identifier => (
      identifier.length === 0
      || (/^\d+$/.test(identifier) && isNonCanonicalNumericIdentifier(identifier))
    )),
    `non-canonical prerelease in ${JSON.stringify(value)}`,
  )
  invariant(!build?.some(identifier => identifier.length === 0), `non-canonical build metadata in ${JSON.stringify(value)}`)
  invariant(allowBuild || build === null, `build metadata is forbidden in ${JSON.stringify(value)}`)
  return Object.freeze({
    build: build === null ? null : Object.freeze(build),
    core: Object.freeze(core),
    normalized: `${core.join('.')}${prerelease === null ? '' : `-${prerelease.join('.')}`}${build === null ? '' : `+${build.join('.')}`}`,
    prerelease: prerelease === null ? null : Object.freeze(prerelease),
  })
}

export function compareExactSemver(leftValue, rightValue, {
  rightAllowsLegacyPrefix = false,
} = {}) {
  const left = parseExactSemver(leftValue, { allowBuild: false })
  const right = parseExactSemver(rightValue, {
    allowBuild: false,
    allowLegacyPrefix: rightAllowsLegacyPrefix,
  })
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return compareNumericIdentifier(left.core[index], right.core[index])
    }
  }
  const x = left.prerelease
  const y = right.prerelease
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if (x[index] === undefined || y[index] === undefined) return x[index] === undefined ? -1 : 1
    if (x[index] === y[index]) continue
    const leftNumeric = /^\d+$/.test(x[index])
    const rightNumeric = /^\d+$/.test(y[index])
    if (leftNumeric && rightNumeric) return compareNumericIdentifier(x[index], y[index])
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return compareAscii(x[index], y[index])
  }
  return 0
}

function regularManifest(pathValue) {
  invariant(typeof pathValue === 'string' && pathValue.length > 0, 'manifest path must be non-empty')
  const path = resolve(pathValue)
  const info = lstatSync(path)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(path) === path,
    `manifest must be a single-link regular file with no symlink ancestry:${path}`,
  )
  invariant(info.size > 0 && info.size <= MAX_MANIFEST_BYTES, `manifest byte size is outside the closed limit:${path}`)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`WF-STATIC-VALIDATION-001:manifest is invalid JSON:${path}:${error.message}`)
  }
  invariant(manifest && typeof manifest === 'object' && !Array.isArray(manifest), `manifest root must be an object:${path}`)
  return Object.freeze({ manifest, path })
}

function packageVersion(pathValue) {
  const { manifest, path } = regularManifest(pathValue)
  parseExactSemver(manifest.version, { allowBuild: false })
  return Object.freeze({ path, value: manifest.version })
}

function exactNpmVersion(pathValue) {
  const { manifest, path } = regularManifest(pathValue)
  const value = manifest.devDependencies?.npm
  parseExactSemver(value, { allowBuild: false })
  return Object.freeze({ path, value })
}

function dependencySpec(pathValue, packageName) {
  invariant(ALLOWED_DEPENDENCIES.has(packageName), `dependency is outside the closed workflow set:${String(packageName)}`)
  const { manifest, path } = regularManifest(pathValue)
  const value = manifest.dependencies?.[packageName]
  invariant(typeof value === 'string' && value.length > 0, `manifest has no exact ${packageName} dependency:${path}`)
  return Object.freeze({ path, value })
}

export function assertPackageVersion({ manifestPath, expected }) {
  parseExactSemver(expected, { allowBuild: false })
  const observed = packageVersion(manifestPath)
  invariant(observed.value === expected, `${observed.path} version ${JSON.stringify(observed.value)} differs from ${JSON.stringify(expected)}`)
  return observed
}

export function assertPackageDependency({ manifestPath, packageName, expected }) {
  parseExactSemver(expected, { allowBuild: false })
  const observed = dependencySpec(manifestPath, packageName)
  invariant(observed.value === expected, `${observed.path} ${packageName} ${JSON.stringify(observed.value)} differs from ${JSON.stringify(expected)}`)
  return observed
}

export function assertMirrorVersionFloor({
  rootManifestPath,
  appManifestPath,
  builtVersion,
}) {
  parseExactSemver(builtVersion, { allowBuild: false })
  const observed = [
    ['root design-system', dependencySpec(rootManifestPath, '@qijenchen/design-system').value],
    ['root storybook-config', dependencySpec(rootManifestPath, '@qijenchen/storybook-config').value],
    ['app design-system', dependencySpec(appManifestPath, '@qijenchen/design-system').value],
  ]
  const normalized = observed.map(([label, spec]) => [
    label,
    spec,
    parseExactSemver(spec, { allowBuild: false, allowLegacyPrefix: true }).normalized,
  ])
  const versions = new Set(normalized.map(([, , version]) => version))
  invariant(
    versions.size === 1,
    `target package versions are not one canonical release:${normalized.map(([label, spec]) => `${label}=${spec}`).join(',')}`,
  )
  const currentVersion = normalized[0][2]
  invariant(
    compareExactSemver(builtVersion, currentVersion) >= 0,
    `refusing mirror downgrade ${builtVersion} < ${currentVersion}`,
  )
  return Object.freeze({ builtVersion, currentVersion })
}

function parseClosedFlags(args, allowed) {
  invariant(args.length % 2 === 0, 'every option must have exactly one value')
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    invariant(allowed.has(flag), `unknown option:${String(flag)}`)
    invariant(!values.has(flag), `duplicate option:${flag}`)
    invariant(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), `missing value:${flag}`)
    values.set(flag, value)
  }
  invariant(values.size === allowed.size, `required options are ${[...allowed].join(',')}`)
  return values
}

export function runWorkflowStaticValidationCli(args, { stdout = process.stdout } = {}) {
  invariant(Array.isArray(args) && args.length >= 1, 'one closed command is required')
  const [command, ...options] = args
  if (command === 'assert-exact-semver') {
    const values = parseClosedFlags(options, new Set(['--value']))
    parseExactSemver(values.get('--value'))
    return
  }
  if (command === 'print-package-version') {
    const values = parseClosedFlags(options, new Set(['--manifest']))
    stdout.write(`${packageVersion(values.get('--manifest')).value}\n`)
    return
  }
  if (command === 'print-exact-npm-version') {
    const values = parseClosedFlags(options, new Set(['--manifest']))
    stdout.write(`${exactNpmVersion(values.get('--manifest')).value}\n`)
    return
  }
  if (command === 'assert-package-version') {
    const values = parseClosedFlags(options, new Set(['--manifest', '--expected']))
    assertPackageVersion({
      manifestPath: values.get('--manifest'),
      expected: values.get('--expected'),
    })
    return
  }
  if (command === 'assert-package-dependency') {
    const values = parseClosedFlags(options, new Set(['--manifest', '--package', '--expected']))
    assertPackageDependency({
      manifestPath: values.get('--manifest'),
      packageName: values.get('--package'),
      expected: values.get('--expected'),
    })
    return
  }
  if (command === 'assert-mirror-version-floor') {
    const values = parseClosedFlags(options, new Set([
      '--root-manifest',
      '--app-manifest',
      '--built-version',
    ]))
    assertMirrorVersionFloor({
      rootManifestPath: values.get('--root-manifest'),
      appManifestPath: values.get('--app-manifest'),
      builtVersion: values.get('--built-version'),
    })
    return
  }
  invariant(false, `unknown command:${String(command)}`)
}

const isMain = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    runWorkflowStaticValidationCli(process.argv.slice(2))
  } catch (error) {
    console.error(`❌ workflow static validation failed:${error.message}`)
    process.exit(1)
  }
}
