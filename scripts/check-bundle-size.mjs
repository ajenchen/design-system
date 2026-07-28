#!/usr/bin/env node
// check-bundle-size.mjs — DS library raw artifact-size deterministic gate.
// This budget is intentionally distinct from size-limit's gzip/import-cost and
// production-app chunk budgets; neither gate is evidence that the other ran.

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = realpathSync(resolve(dirname(SCRIPT_PATH), '..'))
export const BUNDLE_SIZE_HEADROOM = 1.10
export const BUNDLE_SIZE_TOP_N = 8

function fail(message) {
  throw new Error(`bundle-size gate:${message}`)
}

export function bundleKilobytes(bytes) {
  return Math.round(bytes / 102.4) / 10
}

export function collectBundleFiles(distDir) {
  const root = resolve(distDir)
  if (!existsSync(root)) fail(`${root} does not exist`)
  const rootInfo = lstatSync(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail(`${root} must be a real no-symlink directory`)
  const files = []

  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      const info = lstatSync(path)
      if (info.isSymbolicLink()) fail(`${relative(root, path)} is a symbolic link`)
      if (info.isDirectory()) walk(path)
      else if (!info.isFile()) fail(`${relative(root, path)} has an unsupported filesystem type`)
      else if (/\.(js|css)$/.test(name)) files.push({ path: relative(root, path), bytes: info.size })
    }
  }

  walk(root)
  return files
}

function measure(distDir, topN) {
  const files = collectBundleFiles(distDir)
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
  const top = [...files]
    .sort((left, right) => right.bytes - left.bytes || compareUtf8Bytes(left.path, right.path))
    .slice(0, topN)
  return { files, totalBytes, top }
}

export function createBundleBudget({
  distDir,
  headroom = BUNDLE_SIZE_HEADROOM,
  topN = BUNDLE_SIZE_TOP_N,
  generatedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!Number.isFinite(headroom) || headroom < 1) fail('headroom must be a finite number >= 1')
  if (!Number.isSafeInteger(topN) || topN < 1) fail('topN must be a positive integer')
  const measurement = measure(distDir, topN)
  return {
    measurement,
    budget: {
      _meta: {
        generatedAt,
        rule: `total 與 top-${topN} entry 各設現值 +${Math.round((headroom - 1) * 100)}% budget;蓄意增大 → 重跑 --init + commit message 說明`,
      },
      totalKB: bundleKilobytes(measurement.totalBytes * headroom),
      entriesKB: Object.fromEntries(
        measurement.top.map((file) => [file.path, bundleKilobytes(file.bytes * headroom)]),
      ),
    },
  }
}

function readBudget(budgetPath) {
  if (!existsSync(budgetPath)) fail(`${budgetPath} does not exist`)
  let budget
  try {
    budget = JSON.parse(readFileSync(budgetPath, 'utf8'))
  } catch (error) {
    fail(`${budgetPath} is not valid JSON:${error.message}`)
  }
  if (!Number.isFinite(budget?.totalKB) || budget.totalKB < 0) fail('budget totalKB must be a finite non-negative number')
  if (!budget.entriesKB || typeof budget.entriesKB !== 'object' || Array.isArray(budget.entriesKB)) {
    fail('budget entriesKB must be an object')
  }
  for (const [path, limit] of Object.entries(budget.entriesKB)) {
    if (!path || !Number.isFinite(limit) || limit < 0) fail(`budget entry ${path || '<empty>'} must be a finite non-negative number`)
  }
  return budget
}

export function checkBundleSize({
  distDir,
  budgetPath,
  topN = BUNDLE_SIZE_TOP_N,
} = {}) {
  const measurement = measure(distDir, topN)
  const budget = readBudget(budgetPath)
  const failures = []
  if (bundleKilobytes(measurement.totalBytes) > budget.totalKB) {
    failures.push(`total ${bundleKilobytes(measurement.totalBytes)}KB > budget ${budget.totalKB}KB`)
  }
  const byPath = new Map(measurement.files.map((file) => [file.path, file.bytes]))
  for (const [path, limitKB] of Object.entries(budget.entriesKB).sort(([left], [right]) => compareUtf8Bytes(left, right))) {
    const current = byPath.get(path)
    if (current !== undefined && bundleKilobytes(current) > limitKB) {
      failures.push(`${path} ${bundleKilobytes(current)}KB > budget ${limitKB}KB`)
    }
  }
  return { ok: failures.length === 0, failures, budget, ...measurement }
}

export function runBundleSizeGate({
  mode,
  root = DEFAULT_ROOT,
  distDir = join(resolve(root), 'packages/design-system/dist'),
  budgetPath = join(resolve(root), 'packages/design-system/bundle-budget.json'),
  headroom = BUNDLE_SIZE_HEADROOM,
  topN = BUNDLE_SIZE_TOP_N,
  generatedAt,
} = {}) {
  if (!['--init', '--check'].includes(mode)) fail('mode must be --init or --check')
  if (mode === '--check') return { mode, distDir, budgetPath, ...checkBundleSize({ distDir, budgetPath, topN }) }

  const initialized = createBundleBudget({ distDir, headroom, topN, generatedAt })
  writeFileSync(budgetPath, `${JSON.stringify(initialized.budget, null, 2)}\n`)
  return { mode, distDir, budgetPath, ok: true, ...initialized }
}

function displayPath(root, path) {
  const value = relative(root, path)
  return value || '.'
}

function main() {
  const mode = process.argv[2]
  if (!['--init', '--check'].includes(mode ?? '')) {
    console.error('用法: node scripts/check-bundle-size.mjs --init|--check')
    process.exitCode = 1
    return
  }

  try {
    const result = runBundleSizeGate({ mode })
    if (mode === '--init') {
      console.log(`✅ budget 寫入 ${displayPath(DEFAULT_ROOT, result.budgetPath)}(total ${bundleKilobytes(result.measurement.totalBytes)}KB → budget ${result.budget.totalKB}KB;top-${BUNDLE_SIZE_TOP_N} entries)`)
      return
    }
    if (!result.ok) {
      console.error('❌ bundle-size gate FAIL:')
      for (const failure of result.failures) console.error(`   - ${failure}`)
      console.error('   蓄意增大(新元件/新依賴)→ node scripts/check-bundle-size.mjs --init 更新 budget + commit 說明;')
      console.error('   非蓄意 → 查新增 import(lucide 全庫 / 重複依賴,見 performance-audit SKILL Phase 3)。')
      process.exitCode = 1
      return
    }
    console.log(`✅ bundle-size gate PASS(total ${bundleKilobytes(result.totalBytes)}KB ≤ ${result.budget.totalKB}KB;top-${BUNDLE_SIZE_TOP_N} entries 全部在 budget 內)`)
  } catch (error) {
    const distPath = displayPath(DEFAULT_ROOT, join(DEFAULT_ROOT, 'packages/design-system/dist'))
    if (error.message.includes('does not exist') && error.message.includes('dist')) {
      console.error(`❌ ${distPath} 不存在 — 先跑 npm run build:lib(本 gate 設計為 build 後執行)`)
    } else {
      console.error(`❌ ${error.message}`)
    }
    process.exitCode = 1
  }
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH) } catch { return false }
})()

if (IS_MAIN) main()
