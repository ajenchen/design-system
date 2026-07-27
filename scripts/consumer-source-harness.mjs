#!/usr/bin/env node

import { createRequire } from 'node:module'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

// Product architecture is part of the protected template contract. Letting a candidate choose
// different workspace roots would also let it choose which source the base-trusted compiler sees.
export const CANONICAL_PRODUCT_WORKSPACES = Object.freeze(['apps/*'])
export const CANONICAL_ROOT_BUILD_SCRIPTS = Object.freeze({
  build: 'npm run build --workspaces',
  typecheck: 'tsc -b',
})
export const CANONICAL_WORKSPACE_BUILD_SCRIPTS = Object.freeze({
  build: 'tsc -b && vite build',
  typecheck: 'tsc --noEmit',
})
export const TRUSTED_PRODUCT_CHECK_FILES = Object.freeze([
  'scripts/audit-consumer-a11y.mjs',
  'scripts/consumer-source-harness.mjs',
  'scripts/lib/a11y-static-server.mjs',
  'scripts/lint-ds-internal-imports.mjs',
])
export const TRUSTED_PRODUCT_RUNTIME_FILES = Object.freeze([
  'node_modules/axe-core/axe.min.js',
  'node_modules/axe-core/package.json',
  'node_modules/playwright/cli.js',
  'node_modules/playwright/package.json',
  'node_modules/playwright-core/package.json',
])
const TRUSTED_PRODUCT_CHECK_SEAL = 'trusted-product-checks.seal.json'

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(path) {
  const stat = lstatSync(path)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${path} must be a regular non-symlink file`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function regularNonSymlinkFile(path, label) {
  const stat = lstatSync(path)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  invariant((stat.mode & 0o022) === 0, `${label} may not be group- or world-writable`)
  return stat
}

function protectedProductCheckRoots({ trustedRoot, outputRoot }) {
  trustedRoot = resolve(trustedRoot)
  outputRoot = resolve(outputRoot)
  realDirectory(trustedRoot, 'protected-base root')
  invariant(
    outputRoot.startsWith(`${trustedRoot}${sep}`) && outputRoot !== trustedRoot,
    'trusted product-check output must be a child of the protected-base checkout',
  )
  invariant(
    !outputRoot.startsWith(`${resolve(trustedRoot, 'node_modules')}${sep}`),
    'trusted product-check output may not overlap protected dependencies',
  )
  return { trustedRoot, outputRoot }
}

function trustedProductSeal({ trustedRoot, outputRoot }) {
  const tools = TRUSTED_PRODUCT_CHECK_FILES.map(path => {
    const source = join(trustedRoot, path)
    regularNonSymlinkFile(source, `protected product-check source ${path}`)
    return { path, sha256: sha256(source) }
  })
  const runtime = TRUSTED_PRODUCT_RUNTIME_FILES.map(path => {
    const source = join(trustedRoot, path)
    regularNonSymlinkFile(source, `protected product-check runtime ${path}`)
    return { path, sha256: sha256(source) }
  })
  return {
    schemaVersion: 1,
    boundary: 'protected-base-product-checks-v1',
    tools,
    runtime,
    output: relative(trustedRoot, outputRoot).replaceAll('\\', '/'),
  }
}

function makeDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o755 })
  const stat = lstatSync(path)
  invariant(stat.isDirectory() && !stat.isSymbolicLink(), `trusted product-check directory is invalid: ${path}`)
  invariant((stat.mode & 0o022) === 0, `trusted product-check directory may not be group- or world-writable: ${path}`)
}

/**
 * Copy every post-build product checker from protected base before candidate code runs.
 * The workflow executes the candidate build under a different uid, so this owner-only
 * tree and the protected-base dependency runtime are outside its write authority.
 */
export function stageTrustedProductChecks(options) {
  const { trustedRoot, outputRoot } = protectedProductCheckRoots(options)
  invariant(!existsSync(outputRoot), 'trusted product-check output already exists')
  makeDirectory(outputRoot)
  const seal = trustedProductSeal({ trustedRoot, outputRoot })

  for (const entry of seal.tools) {
    const destination = join(outputRoot, entry.path)
    makeDirectory(dirname(destination))
    copyFileSync(join(trustedRoot, entry.path), destination)
    chmodSync(destination, 0o555)
    invariant(sha256(destination) === entry.sha256, `trusted product-check copy drifted during staging: ${entry.path}`)
  }

  const sealPath = join(outputRoot, TRUSTED_PRODUCT_CHECK_SEAL)
  writeFileSync(sealPath, `${JSON.stringify(seal, null, 2)}\n`, { mode: 0o444 })
  chmodSync(sealPath, 0o444)
  return seal
}

export function verifyTrustedProductChecks(options) {
  const { trustedRoot, outputRoot } = protectedProductCheckRoots(options)
  realDirectory(outputRoot, 'trusted product-check output')
  const sealPath = join(outputRoot, TRUSTED_PRODUCT_CHECK_SEAL)
  regularNonSymlinkFile(sealPath, 'trusted product-check seal')
  const seal = readJson(sealPath)
  invariant(
    seal.schemaVersion === 1
      && seal.boundary === 'protected-base-product-checks-v1'
      && seal.output === relative(trustedRoot, outputRoot).replaceAll('\\', '/'),
    'trusted product-check seal identity is invalid',
  )
  const expected = trustedProductSeal({ trustedRoot, outputRoot })
  invariant(JSON.stringify(seal) === JSON.stringify(expected), 'trusted product-check protected source or runtime drifted')
  for (const entry of seal.tools) {
    const destination = join(outputRoot, entry.path)
    regularNonSymlinkFile(destination, `staged trusted product check ${entry.path}`)
    invariant(sha256(destination) === entry.sha256, `staged trusted product check drifted: ${entry.path}`)
  }
  return { tools: seal.tools.length, runtime: seal.runtime.length }
}

function realDirectory(path, label) {
  const stat = lstatSync(path)
  invariant(stat.isDirectory() && !stat.isSymbolicLink(), `${label} must be a real directory`)
  return path
}

function sourceFiles(root) {
  realDirectory(root, 'consumer source root')
  const ignoredDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', 'storybook-static', '.next'])
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const path = join(directory, entry.name)
      const stat = lstatSync(path)
      invariant(!stat.isSymbolicLink(), `consumer source contains symlink: ${path}`)
      if (stat.isDirectory() && directory === root && ignoredDirectories.has(entry.name)) continue
      if (stat.isDirectory()) visit(path)
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
        invariant(stat.isFile(), `consumer source contains a special executable entry: ${path}`)
        files.push(path)
      }
    }
  }
  visit(root)
  return files
}

function workspaceDirectories(repo, patterns) {
  const directories = []
  for (const pattern of patterns) {
    invariant(typeof pattern === 'string' && /^[A-Za-z0-9._/-]+\/\*$/.test(pattern), `unsupported or unsafe workspace pattern: ${pattern}`)
    const parent = join(repo, pattern.slice(0, -2))
    invariant(existsSync(parent), `workspace parent is missing: ${pattern}`)
    realDirectory(parent, `workspace parent ${pattern}`)
    for (const name of readdirSync(parent).sort()) {
      const directory = join(parent, name)
      const stat = lstatSync(directory)
      invariant(!stat.isSymbolicLink(), `workspace entry may not be a symlink: ${relative(repo, directory)}`)
      if (stat.isDirectory()) {
        invariant(existsSync(join(directory, 'package.json')), `canonical workspace directory has no package.json: ${relative(repo, directory)}`)
        readJson(join(directory, 'package.json'))
        directories.push(directory)
      } else invariant(stat.isFile(), `workspace parent contains a special filesystem entry: ${relative(repo, directory)}`)
    }
  }
  return [...new Set(directories)]
}

function canonicalScript(value, expected, label) {
  invariant(value === expected, `${label} must equal the protected command: ${expected}`)
}

function assertInstalledTool(repo, packagePath, name) {
  const expected = resolve(repo, 'node_modules', name, 'package.json')
  invariant(resolve(packagePath) === expected, `${name} must resolve to its exact registry installation, not a workspace shadow`)
  let cursor = repo
  for (const part of relative(repo, expected).split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, part)
    const stat = lstatSync(cursor)
    invariant(!stat.isSymbolicLink(), `${name} installation contains a symlink component: ${relative(repo, cursor)}`)
  }
  invariant(lstatSync(expected).isFile(), `${name} package.json must be a regular file`)
}

function formatDiagnostics(ts, diagnostics, repo) {
  return diagnostics.slice(0, 20).map(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    if (!diagnostic.file || diagnostic.start === undefined) return message
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `${relative(repo, diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`
  }).join('\n')
}

export function validateConsumerSource({ repo, typescriptModule = null, build = true }) {
  repo = resolve(repo)
  realDirectory(repo, 'consumer repository root')
  const rootPackage = readJson(join(repo, 'package.json'))
  invariant(Array.isArray(rootPackage.workspaces) && rootPackage.workspaces.length > 0, 'consumer root must enumerate nonempty workspaces')
  invariant(
    JSON.stringify(rootPackage.workspaces) === JSON.stringify(CANONICAL_PRODUCT_WORKSPACES),
    `consumer workspaces must equal the protected product roots: ${CANONICAL_PRODUCT_WORKSPACES.join(', ')}`,
  )
  canonicalScript(rootPackage.scripts?.build, CANONICAL_ROOT_BUILD_SCRIPTS.build, 'root build')
  canonicalScript(rootPackage.scripts?.typecheck, CANONICAL_ROOT_BUILD_SCRIPTS.typecheck, 'root typecheck')
  const workspaces = workspaceDirectories(repo, rootPackage.workspaces)
  invariant(workspaces.length > 0, 'consumer build harness found zero configured app workspaces')
  const files = []
  let productSourceFiles = 0
  for (const workspace of workspaces) {
    const manifest = readJson(join(workspace, 'package.json'))
    const label = `workspace ${relative(repo, workspace)}`
    const workspaceName = `@product/${workspace.split(/[\\/]/).at(-1)}`
    invariant(manifest.private === true && manifest.name === workspaceName, `${label} must be the private canonical workspace ${workspaceName}`)
    canonicalScript(manifest.scripts?.build, CANONICAL_WORKSPACE_BUILD_SCRIPTS.build, `${label} build`)
    canonicalScript(manifest.scripts?.typecheck, CANONICAL_WORKSPACE_BUILD_SCRIPTS.typecheck, `${label} typecheck`)
    const sourceRoot = join(workspace, 'src')
    invariant(existsSync(sourceRoot), `${label} has no src directory`)
    realDirectory(sourceRoot, `${label} src`)
    const workspaceSources = sourceFiles(workspace)
    const sourcePrefix = `${resolve(sourceRoot)}${process.platform === 'win32' ? '\\' : '/'}`
    const productSources = workspaceSources.filter(path => resolve(path).startsWith(sourcePrefix))
    invariant(productSources.length > 0, `${label} has no executable source files`)
    productSourceFiles += productSources.length
    files.push(...workspaceSources)
  }

  const requireFromCandidate = createRequire(join(repo, 'package.json'))
  if (!typescriptModule) assertInstalledTool(repo, requireFromCandidate.resolve('typescript/package.json'), 'typescript')
  const ts = typescriptModule ?? requireFromCandidate('typescript')
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    isolatedModules: true,
  }
  const program = ts.createProgram({ rootNames: files, options })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  invariant(diagnostics.length === 0, `base-owned exhaustive TypeScript harness failed:\n${formatDiagnostics(ts, diagnostics, repo)}`)

  if (build) {
    const vitePackage = requireFromCandidate.resolve('vite/package.json')
    assertInstalledTool(repo, vitePackage, 'vite')
    const vite = join(dirname(vitePackage), 'bin/vite.js')
    for (const workspace of workspaces) {
      const dist = join(workspace, 'dist')
      if (existsSync(dist)) {
        realDirectory(dist, `${relative(repo, workspace)} preexisting dist`)
        rmSync(dist, { recursive: true })
      }
      const result = spawnSync(process.execPath, [vite, 'build'], { cwd: workspace, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 })
      invariant(result.status === 0, `direct pinned Vite build failed for ${relative(repo, workspace)}:\n${(result.stderr || result.stdout || '').slice(-4000)}`)
      const index = join(dist, 'index.html')
      invariant(existsSync(index) && !lstatSync(index).isSymbolicLink() && lstatSync(index).isFile() && lstatSync(index).size > 0, `${relative(repo, workspace)} build produced no nonempty regular dist/index.html`)
      const assets = join(dist, 'assets')
      if (existsSync(assets)) realDirectory(assets, `${relative(repo, workspace)} dist/assets`)
      const scripts = existsSync(assets) ? readdirSync(assets).filter(name => {
        const path = join(assets, name)
        const stat = lstatSync(path)
        return name.endsWith('.js') && !stat.isSymbolicLink() && stat.isFile() && stat.size > 0
      }) : []
      invariant(scripts.length > 0, `${relative(repo, workspace)} build produced no nonempty JavaScript asset`)
    }
  }
  return { workspaces: workspaces.map(path => relative(repo, path).replaceAll('\\', '/')), sourceFiles: productSourceFiles, built: build }
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2)
  const trustedAt = args.indexOf('--trusted')
  const stageAt = args.indexOf('--stage-trusted-product-checks')
  const verifyAt = args.indexOf('--verify-trusted-product-checks')
  try {
    if (
      trustedAt >= 0
      && args[trustedAt + 1]
      && ((stageAt >= 0) !== (verifyAt >= 0))
      && args[(stageAt >= 0 ? stageAt : verifyAt) + 1]
      && args.length === 4
    ) {
      const options = {
        trustedRoot: args[trustedAt + 1],
        outputRoot: args[(stageAt >= 0 ? stageAt : verifyAt) + 1],
      }
      const result = stageAt >= 0
        ? stageTrustedProductChecks(options)
        : verifyTrustedProductChecks(options)
      console.log(
        stageAt >= 0
          ? `trusted product checks staged (${result.tools.length} tools, ${result.runtime.length} runtime anchors)`
          : `trusted product checks verified (${result.tools} tools, ${result.runtime} runtime anchors)`,
      )
    } else {
      const repoAt = args.indexOf('--repo')
      if (repoAt < 0 || !args[repoAt + 1] || args.length !== 2) {
        throw new Error('usage: consumer-source-harness.mjs --repo <candidate> | (--stage-trusted-product-checks|--verify-trusted-product-checks) <output> --trusted <protected-base>')
      }
      const result = validateConsumerSource({ repo: args[repoAt + 1] })
      console.log(`consumer source harness passed (${result.workspaces.length} workspaces, ${result.sourceFiles} source files)`)
    }
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
