#!/usr/bin/env node
// check-src-republish.mjs — 機械閘:DS src 改了但版本沒 bump → BLOCK(防 ship stale)
//
// 2026-06-08 補(user 質問「ds push main → template 自動同步」鏈最弱的非機械環節):
//   release.yml 只接受從 protected default branch 載入的 `stage-protected-release`
//   repository_dispatch；plain main push 不 republish，payload exact tag 只是必須等於當前
//   protected main HEAD 的 release identity 資料，不是 privileged workflow 來源。
//   所以「DS src(含 stories/components)改了 push main、但 AI 忘記 bump 並完成上述 dispatch」→ npm 版本 stale →
//   consumer `npm install @beta` 解析到同版本 = no-op → 拿不到新 code。**完全沒有機械閘擋這個**。
//
// 本 gate(CI main-push + release-preflight + release.yml 三處跑):
//   baseline = npm registry 的 unauthenticated HTTPS readback；transport/schema/tag 缺失一律 fail-closed，
//   不再用 ambient npm、PATH Git 或 warn-only skip。
//   diff **npm 真實 publish surface**(SSOT = packages/design-system/package.json "files" 欄)
//   between v<baseline> 與 HEAD。2026-07-14 dim-66 修:原 gate 只看 src runtime + ds-canonical/fork,
//   且註解錯稱「stories / spec.md 不 ship」—— files 欄實際 ship src/**/*.{tsx,ts,css}(**含 stories**,
//   無 negate)+ src/**/*.spec.md + src/**/*.json + **整個 ds-canonical corpus**(rules / references /
//   skills / commands / hooks,僅排 ds-canonical/.claude)+ README.md / AGENTS.md / CLAUDE.md / cli-init.mjs /
//   ds-story-manifest.json / llms*.txt。這些 surface 改了沒 bump 一樣 stale-ship(dispatch event 成功、
//   receiver 重裝未變 @beta 仍是 no-op)。
//   若 ship-relevant diff 非空 **且** currentVersion 不嚴格大於 npm latest(沒 bump 或倒退)→ exit 1(BLOCK)。
//   不 ship 的檔(spec.ts / test.ts / repo 治理檔)改 → 不擋。已 bump → 不擋(會走發版鏈)。
//   網路失敗 / 無 baseline tag / Git diff 不可觀察 → BLOCK，避免把「沒驗到」誤當作「不需發版」。
//
// 對齊世界級:changesets `status --since` / Lerna-Nx affected-since-tag 都用「diff vs published baseline」。

import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from './lib/closed-tool-execution.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const PKG = 'packages/design-system'
const SRC_GLOB = `${PKG}/src`
const PACKAGE_NAME = '@qijenchen/design-system'
const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/@qijenchen%2fdesign-system/latest'
const RELEASE_REPOSITORY_URL = 'https://github.com/ajenchen/design-system.git'
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+)\.(0|[1-9]\d*))?$/
// 整個 ds-canonical corpus ship 進 npm(files: "ds-canonical" + "!ds-canonical/.claude")。
// 歷史:2026-06-08 只納 fork 子目錄(adversarial run-4 MAJOR);2026-07-14 dim-66 對齊 files 欄
// 全 corpus(rules / references / skills / commands / hooks 同樣 ship,改了沒 bump = stale-ship)。
const CANONICAL_GLOB = `${PKG}/ds-canonical`
// package root 的 shipped 單檔(files 欄列名 + package.json 本身 npm 恆 ship)
const ROOT_SHIPPED = [
  `${PKG}/README.md`,
  `${PKG}/AGENTS.md`,
  `${PKG}/CLAUDE.md`,
  `${PKG}/cli-init.mjs`,
  `${PKG}/ds-story-manifest.json`,
  `${PKG}/llms.txt`,
  `${PKG}/llms-full.txt`,
  `${PKG}/package.json`,
]

function invariant(condition, message) {
  if (!condition) throw new Error(`REPUBLISH_GATE_BLOCK:${message}`)
}

function parseVersion(value, label) {
  const match = VERSION.exec(value)
  invariant(match, `${label} is not a closed SemVer release:${String(value)}`)
  return {
    raw: value,
    core: match.slice(1, 4).map(Number),
    channel: match[4] ?? null,
    sequence: match[5] === undefined ? null : Number(match[5]),
  }
}

function compareVersion(leftValue, rightValue) {
  const left = parseVersion(leftValue, 'current package version')
  const right = parseVersion(rightValue, 'published package version')
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1
  }
  if (left.channel === null || right.channel === null) {
    if (left.channel === right.channel) return 0
    return left.channel === null ? 1 : -1
  }
  if (left.channel !== right.channel) return compareUtf8Bytes(left.channel, right.channel)
  return Math.sign(left.sequence - right.sequence)
}

function closedGit(repoRoot, args, { output = 'capture', timeoutMs = 30_000 } = {}) {
  const result = runClosedGit(args, {
    cwd: repoRoot,
    maxOutputBytes: 16 * 1024 * 1024,
    output,
    timeoutMs,
  })
  invariant(
    !result.error && result.signal === null && result.status === 0,
    `closed Git ${args[0]} failed:${result.error?.message || result.signal || result.status}`,
  )
  return output === 'capture' ? result.stdout : ''
}

function verifyRepository(repoRoot) {
  assertClosedGitLocalConfiguration(repoRoot)
  const topLevel = closedGit(repoRoot, ['rev-parse', '--show-toplevel']).trim()
  invariant(topLevel === repoRoot, `Git top-level differs from the exact checker root:${topLevel}`)
}

function publishedTagCommitFromRemote({ baselineTag, repoRoot }) {
  const advertised = closedGit(repoRoot, [
    'ls-remote',
    '--tags',
    RELEASE_REPOSITORY_URL,
    `refs/tags/${baselineTag}`,
    `refs/tags/${baselineTag}^{}`,
  ]).trim().split('\n').filter(Boolean)
  const rows = advertised.map((line) => line.split('\t'))
  invariant(
    rows.length === 2
      && rows.every(parts => parts.length === 2 && /^[0-9a-f]{40,64}$/.test(parts[0]))
      && rows.some(parts => parts[1] === `refs/tags/${baselineTag}`)
      && rows.some(parts => parts[1] === `refs/tags/${baselineTag}^{}`),
    `published baseline is not one exact annotated remote tag:${baselineTag}`,
  )
  const commit = rows.find(parts => parts[1].endsWith('^{}'))[0]
  try {
    closedGit(repoRoot, ['cat-file', '-e', `${commit}^{commit}`])
  } catch {
    closedGit(repoRoot, [
      'fetch',
      '--quiet',
      '--depth=1',
      RELEASE_REPOSITORY_URL,
      `refs/tags/${baselineTag}`,
    ], { output: 'ignore' })
    closedGit(repoRoot, ['cat-file', '-e', `${commit}^{commit}`])
  }
  return commit
}

async function publishedVersionFromRegistry({
  fetcher = globalThis.fetch,
  timeoutMs = 20_000,
} = {}) {
  invariant(typeof fetcher === 'function', 'registry HTTPS client is unavailable')
  const response = await fetcher(REGISTRY_LATEST_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'qijenchen-governance-republish-gate/1',
    },
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  })
  invariant(response?.status === 200, `npm registry latest readback returned HTTP ${response?.status ?? 'unknown'}`)
  const declaredLength = response.headers?.get?.('content-length')
  if (declaredLength !== null && declaredLength !== undefined) {
    invariant(/^\d+$/.test(declaredLength) && Number(declaredLength) <= 1024 * 1024, 'npm registry response length is invalid')
  }
  const bytes = await response.arrayBuffer()
  invariant(bytes.byteLength > 0 && bytes.byteLength <= 1024 * 1024, 'npm registry response is empty or oversized')
  let document
  try {
    document = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch (error) {
    throw new Error(`REPUBLISH_GATE_BLOCK:npm registry response is invalid JSON:${error.message}`, { cause: error })
  }
  invariant(
    document
      && typeof document === 'object'
      && !Array.isArray(document)
      && document.name === PACKAGE_NAME
      && typeof document.version === 'string',
    'npm registry latest response does not identify the exact package/version',
  )
  parseVersion(document.version, 'published package version')
  return document.version
}
// files 欄對照(SSOT = packages/design-system/package.json):
//   src/**/*.{tsx,ts,css} + *.spec.md + *.json ship(**含 stories.tsx** — 無 negate);
//   顯式 negate:!src/**/*.spec.ts / !src/**/*.test.ts / !ds-canonical/.claude。
export const isShipRelevant = (f) => {
  if (ROOT_SHIPPED.includes(f)) return true
  if (f.startsWith(`${CANONICAL_GLOB}/`)) return !f.startsWith(`${CANONICAL_GLOB}/.claude/`)
  if (!f.startsWith(`${SRC_GLOB}/`)) return false
  if (/\.spec\.ts$/.test(f) || /\.test\.ts$/.test(f)) return false
  return /\.(tsx|ts|css|json)$/.test(f) || /\.spec\.md$/.test(f)
}
export async function runRepublishGate({
  baselineCommitResolver = publishedTagCommitFromRemote,
  publishedVersionResolver = publishedVersionFromRegistry,
  repoRoot: requestedRoot = ROOT,
} = {}) {
  const repoRoot = realpathSync(resolve(requestedRoot))
  verifyRepository(repoRoot)
  const packagePath = join(repoRoot, PKG, 'package.json')
  const packageInfo = lstatSync(packagePath)
  invariant(packageInfo.isFile() && !packageInfo.isSymbolicLink() && realpathSync(packagePath) === packagePath, 'design-system package manifest is not one exact regular file')
  const currentVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version
  parseVersion(currentVersion, 'current package version')

  let baselineVersion
  try {
    baselineVersion = await publishedVersionResolver()
  } catch (error) {
    throw new Error(`REPUBLISH_GATE_BLOCK:published npm baseline is unavailable:${error.message}`, { cause: error })
  }
  parseVersion(baselineVersion, 'published package version')
  const baselineTag = `v${baselineVersion}`
  const baselineCommit = await baselineCommitResolver({ baselineTag, repoRoot })
  invariant(/^[0-9a-f]{40,64}$/.test(baselineCommit), `published baseline tag does not resolve to one commit:${baselineTag}`)

  const changedBytes = closedGit(repoRoot, [
    'diff',
    '--name-only',
    '-z',
    baselineCommit,
    'HEAD',
    '--',
    SRC_GLOB,
    CANONICAL_GLOB,
    ...ROOT_SHIPPED,
  ])
  const changed = changedBytes.split('\0').filter(Boolean)
  const shipDiff = changed.filter(isShipRelevant)
  if (shipDiff.length === 0) {
    console.log(`✓ republish gate:npm publish surface 無 ship-relevant 改動 vs ${baselineTag}(非 shipped 檔或無改)→ 不需 republish`)
    return { baselineCommit, baselineVersion, currentVersion, shipDiff, status: 'not-required' }
  }
  const comparison = compareVersion(currentVersion, baselineVersion)
  if (comparison <= 0) {
    const reason = comparison === 0 ? `版本沒 bump(still ${currentVersion})` : `版本倒退(${baselineVersion} → ${currentVersion})`
    console.error(`\n❌ republish gate BLOCK:npm publish surface 已改但${reason}`)
    console.error('   → 此 push 不會產生可被 consumer 解析的新 immutable npm 版本。')
    console.error(`   ship-relevant 改動(${shipDiff.length}):`)
    shipDiff.slice(0, 20).forEach((f) => console.error(`     - ${f}`))
    console.error('\n   修:bump packages/design-system/package.json 版本 → commit/push 同一 task branch → 執行 `npm run release:auto`；orchestrator 依 five-step SSOT 完成 protected PR、merge、publish、readback、consumer。')
    throw new Error('REPUBLISH_GATE_BLOCK:publish surface changed without a strictly newer package version')
  }
  console.log(`✓ republish gate:publish surface 改了且版本已 bump(${baselineVersion} → ${currentVersion})→ 會走發版鏈,OK`)
  return { baselineCommit, baselineVersion, currentVersion, shipDiff, status: 'version-bumped' }
}

const IS_MAIN = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
if (IS_MAIN) {
  if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--check')) {
    console.error('usage: node scripts/check-src-republish.mjs [--check]')
    process.exit(2)
  }
  try {
    await runRepublishGate()
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
}
