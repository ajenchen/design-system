#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 的兩種體積上限住在同一份檔(packages/design-system/bundle-budget.json),由同一支程式重設:
 *        (1) 發布產物的原始 byte(totalKB + 最大 8 支 entriesKB;本閘 --check 每個 PR 量);
 *        (2) 含相依套件的 gzip 大小(sizeLimit 段;排程「Monitor bundle size drift」跑 size-limit 量,
 *            size-limit 讀根目錄 .size-limit.mjs,而它只是從 sizeLimit 段推導)。
 *        --check 同時驗 size-limit 只讀得到這一份:根 package.json 沒有 "size-limit" 段、沒有其他
 *        size-limit 設定檔、.size-limit.mjs 匯出的內容逐項等於推導結果。
 *   紅: (1) 任一項超出 budget → 列出「現值 > budget」並 exit 1;sizeLimit 段缺 / 格式不對、出現第二份
 *        size-limit 設定、.size-limit.mjs 不等於推導結果 → 指名並 exit 1(test-check-bundle-size.mjs 的
 *        合成對照組驗過每一種都會紅)。
 *   綠: 全部在 budget 內、且 size-limit 設定只有推導出來的那一份時綠。不是抽籤 —— 量的是 dist 檔案的實際
 *        byte 數,同一份 build 恆等;蓄意增大要跑 --init 重設並在 commit 說明,棘輪因此只會被有意識地放寬。
 *   註: 2026-09-21 之前只註冊成 npm script、沒有任何 workflow 呼叫,上次設基準是 2026-07-14,
 *        兩個月的成長全沒被擋(重設當天 total 超出舊 budget 19%、DataTable 36%)。
 *        2026-10-14(待辦總帳 SM3):size-limit 的上限原本寫在根 package.json,06-11 設定後從沒重設 ——
 *        --init 只認得這裡的原始 byte 那份,排程 monitor 09-16 起每天紅、沒人看見。兩份併成這一份檔,
 *        --init 一次重設兩段;size-limit 設定改由 sizeLimit 段推導,不再有第二份可以各自漂移。
 */
// check-bundle-size.mjs — DS bundle budgets: one file, one reset procedure, two metrics.
// The raw-byte budget (this gate, every PR) and the gzip-with-dependencies budget (size-limit,
// scheduled monitor) measure different numbers, so neither is evidence that the other passed —
// but both limits live in bundle-budget.json and `--init` re-bases both from one measurement run.

import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DEFAULT_ROOT = realpathSync(resolve(dirname(SCRIPT_PATH), '..'))
export const BUNDLE_SIZE_HEADROOM = 1.10
export const BUNDLE_SIZE_TOP_N = 8
export const BUNDLE_BUDGET_PATH = 'packages/design-system/bundle-budget.json'
export const BUNDLE_BUDGET_SECTIONS = ['raw', 'size-limit']
// size-limit 唯一允許的設定檔(只做推導)。其餘 size-limit 12 會搜尋的位置(node_modules/size-limit/
// get-config.js searchPlaces)一律不准存在:package.json 的 "size-limit" 段與前三個排在 .size-limit.mjs
// 前面,會搶先被讀到、讓推導那份靜默失效;後面幾個雖然讀不到,存在就是第二份上限。
export const SIZE_LIMIT_CONFIG_FILE = '.size-limit.mjs'
export const SIZE_LIMIT_OTHER_CONFIG_FILES = [
  '.size-limit.json',
  '.size-limit',
  '.size-limit.js',
  '.size-limit.cjs',
  '.size-limit.ts',
  '.size-limit.mts',
  '.size-limit.cts',
]
const SIZE_LIMIT_CHECK_FIELDS = new Set(['name', 'path', 'gzip', 'ignore', 'limit'])
const SIZE_LIMIT_LIMIT_PATTERN = /^\d+(?:\.\d)? kB$/
export const SIZE_LIMIT_FIX_MESSAGE = `  上限來源 ${BUNDLE_BUDGET_PATH} 的 sizeLimit 段(${SIZE_LIMIT_CONFIG_FILE} 只是推導)。`
  + '蓄意增大 → build:lib + build 後 node scripts/check-bundle-size.mjs --init --section=size-limit,commit 寫明成長來源;'
  + '非蓄意 → 查新增 import(lucide 全庫 / 重複依賴)'

function fail(message) {
  throw new Error(`bundle-size gate:${message}`)
}

export function bundleKilobytes(bytes) {
  return Math.round(bytes / 102.4) / 10
}

// size-limit 的單位是 kB = 1000 bytes(bytes-iec metric),與上面 1024 進位的 totalKB / entriesKB 不同,
// 所以 sizeLimit 段的上限一律帶單位寫成字串;無條件進位到 0.1 kB,上限不會低於「現值 × headroom」。
export function sizeLimitKilobytes(bytes) {
  return `${(Math.ceil(bytes / 100) / 10).toFixed(1)} kB`
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

function assertHeadroom(headroom) {
  if (!Number.isFinite(headroom) || headroom < 1) fail('headroom must be a finite number >= 1')
}

function headroomRule(headroom) {
  return `+${Math.round((headroom - 1) * 100)}%`
}

export function createBundleBudget({
  distDir,
  headroom = BUNDLE_SIZE_HEADROOM,
  topN = BUNDLE_SIZE_TOP_N,
  generatedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  assertHeadroom(headroom)
  if (!Number.isSafeInteger(topN) || topN < 1) fail('topN must be a positive integer')
  const measurement = measure(distDir, topN)
  return {
    measurement,
    budget: {
      _meta: {
        generatedAt,
        rule: `total 與 top-${topN} entry 各設現值 ${headroomRule(headroom)} budget;蓄意增大 → 重跑 --init + commit message 說明`,
      },
      totalKB: bundleKilobytes(measurement.totalBytes * headroom),
      entriesKB: Object.fromEntries(
        measurement.top.map((file) => [file.path, bundleKilobytes(file.bytes * headroom)]),
      ),
    },
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateSizeLimitSection(section) {
  if (!isPlainObject(section)) fail('budget sizeLimit must be an object(size-limit 上限的唯一來源)')
  if (!Array.isArray(section.checks) || section.checks.length === 0) fail('budget sizeLimit.checks must be a non-empty array')
  const names = new Set()
  for (const check of section.checks) {
    if (!isPlainObject(check)) fail('budget sizeLimit.checks entries must be objects')
    const label = typeof check.name === 'string' && check.name ? check.name : '<unnamed>'
    for (const field of Object.keys(check)) {
      if (!SIZE_LIMIT_CHECK_FIELDS.has(field)) fail(`budget sizeLimit check ${label} has unsupported field ${field}`)
    }
    if (label === '<unnamed>') fail('budget sizeLimit check name must be a non-empty string')
    if (names.has(check.name)) fail(`budget sizeLimit check name ${check.name} is duplicated(size-limit --json 以 name 對回上限)`)
    names.add(check.name)
    if (typeof check.path !== 'string' || !check.path) fail(`budget sizeLimit check ${label} path must be a non-empty string`)
    if (check.gzip !== undefined && typeof check.gzip !== 'boolean') fail(`budget sizeLimit check ${label} gzip must be a boolean`)
    if (check.ignore !== undefined && (!Array.isArray(check.ignore) || !check.ignore.every((item) => typeof item === 'string' && item))) {
      fail(`budget sizeLimit check ${label} ignore must be an array of non-empty strings`)
    }
    if (typeof check.limit !== 'string' || !SIZE_LIMIT_LIMIT_PATTERN.test(check.limit)) {
      fail(`budget sizeLimit check ${label} limit must look like "12.3 kB"(size-limit 的 kB = 1000 bytes)`)
    }
  }
  return section
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
  if (!isPlainObject(budget.entriesKB)) fail('budget entriesKB must be an object')
  for (const [path, limit] of Object.entries(budget.entriesKB)) {
    if (!path || !Number.isFinite(limit) || limit < 0) fail(`budget entry ${path || '<empty>'} must be a finite non-negative number`)
  }
  validateSizeLimitSection(budget.sizeLimit)
  return budget
}

// size-limit 設定的唯一產生方式:sizeLimit 段逐項照抄,加上超標時要印的修法(指回這份檔與重設指令,
// 而不是 size-limit 預設那句「去改設定檔」)。
export function deriveSizeLimitConfig(budget) {
  return validateSizeLimitSection(budget?.sizeLimit).checks.map((check) => ({ ...check, message: SIZE_LIMIT_FIX_MESSAGE }))
}

export function readSizeLimitConfig({ root = DEFAULT_ROOT, budgetPath = join(resolve(root), BUNDLE_BUDGET_PATH) } = {}) {
  return deriveSizeLimitConfig(readBudget(budgetPath))
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

// size-limit 實際會讀到的設定必須就是推導出來的那一份(M37:「有一份推導設定」≠「size-limit 讀的是它」)。
export async function checkSizeLimitConfigSource({
  root = DEFAULT_ROOT,
  budgetPath = join(resolve(root), BUNDLE_BUDGET_PATH),
} = {}) {
  const rootDir = resolve(root)
  const failures = []
  const packageJsonPath = join(rootDir, 'package.json')
  if (existsSync(packageJsonPath)) {
    let packageJson
    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    } catch (error) {
      fail(`package.json is not valid JSON:${error.message}`)
    }
    if (Object.hasOwn(packageJson ?? {}, 'size-limit')) {
      failures.push('package.json 有 "size-limit" 段 —— size-limit 會先讀它、略過推導的那份(第二份上限,06-11 起沒人重設的就是這種)')
    }
  }
  for (const name of SIZE_LIMIT_OTHER_CONFIG_FILES) {
    if (existsSync(join(rootDir, name))) failures.push(`${name} 存在 —— 第二份 size-limit 設定`)
  }
  const configPath = join(rootDir, SIZE_LIMIT_CONFIG_FILE)
  if (!existsSync(configPath)) {
    failures.push(`${SIZE_LIMIT_CONFIG_FILE} 不存在 —— 排程 size-limit 讀不到推導設定`)
  } else {
    const loaded = (await import(pathToFileURL(configPath).href)).default
    const derived = deriveSizeLimitConfig(readBudget(budgetPath))
    if (!isDeepStrictEqual(loaded, derived)) {
      failures.push(`${SIZE_LIMIT_CONFIG_FILE} 匯出的內容不等於 ${BUNDLE_BUDGET_PATH} sizeLimit 段的推導結果(只能 export default readSizeLimitConfig(...))`)
    }
  }
  return { ok: failures.length === 0, failures }
}

// 量 size-limit 現值:跑排程用的同一支 size-limit、同一份推導設定。exit 1(有項目超標)照樣輸出 JSON;
// 輸出不是逐項陣列(例如缺 dist 時的 {"error": …})一律失敗,不拿半套數字重設。
export function measureSizeLimit({ root = DEFAULT_ROOT } = {}) {
  const result = spawnSync(process.execPath, ['--', 'node_modules/size-limit/bin.js', '--json'], {
    cwd: resolve(root),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) fail(`size-limit could not start:${result.error.message}`)
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    fail(`size-limit --json 沒有輸出 JSON(exit ${result.status}):${`${result.stderr}${result.stdout}`.trim().slice(-600)}`)
  }
  if (!Array.isArray(parsed) || ![0, 1].includes(result.status)) {
    fail(`size-limit --json 沒有逐項結果(exit ${result.status}):${JSON.stringify(parsed).slice(0, 600)} —— 先跑 npm run build:lib && npm run build`)
  }
  const sizes = new Map()
  for (const entry of parsed) {
    if (typeof entry?.name !== 'string' || !Number.isSafeInteger(entry.size) || entry.size <= 0) {
      fail(`size-limit --json entry is malformed:${JSON.stringify(entry)}`)
    }
    sizes.set(entry.name, entry.size)
  }
  return sizes
}

export function createSizeLimitBudget({
  section,
  sizes,
  headroom = BUNDLE_SIZE_HEADROOM,
  generatedAt = new Date().toISOString().slice(0, 10),
} = {}) {
  assertHeadroom(headroom)
  const { checks } = validateSizeLimitSection(section)
  const expected = new Set(checks.map((check) => check.name))
  for (const name of sizes.keys()) {
    if (!expected.has(name)) fail(`size-limit measured ${name}, which is not in the sizeLimit section`)
  }
  return {
    _meta: {
      generatedAt,
      unit: 'kB = 1000 bytes(size-limit 的單位;上面 totalKB / entriesKB 是 1024 進位)',
      rule: `每項設現值 ${headroomRule(headroom)}(含相依套件、壓縮後;react / react-dom 列在 ignore 的不算);與上面的原始 byte budget 同一支 --init 重設、同一個 headroom`,
    },
    checks: checks.map((check) => {
      const size = sizes.get(check.name)
      if (size === undefined) fail(`size-limit did not measure ${check.name}`)
      return { ...check, limit: sizeLimitKilobytes(size * headroom) }
    }),
  }
}

export function runBundleSizeInit({
  root = DEFAULT_ROOT,
  distDir = join(resolve(root), 'packages/design-system/dist'),
  budgetPath = join(resolve(root), BUNDLE_BUDGET_PATH),
  section = 'all',
  headroom = BUNDLE_SIZE_HEADROOM,
  topN = BUNDLE_SIZE_TOP_N,
  generatedAt = new Date().toISOString().slice(0, 10),
  measureSizes = () => measureSizeLimit({ root }),
} = {}) {
  if (section !== 'all' && !BUNDLE_BUDGET_SECTIONS.includes(section)) fail(`section must be one of ${BUNDLE_BUDGET_SECTIONS.join(' / ')}`)
  const current = readBudget(budgetPath)
  // 兩段都先量完才寫,任何一段量不到就整份不動。
  const sizeLimit = section === 'raw'
    ? current.sizeLimit
    : createSizeLimitBudget({ section: current.sizeLimit, sizes: measureSizes(), headroom, generatedAt })
  const raw = section === 'size-limit'
    ? { _meta: current._meta, totalKB: current.totalKB, entriesKB: current.entriesKB }
    : createBundleBudget({ distDir, headroom, topN, generatedAt }).budget
  const budget = { ...raw, sizeLimit }
  writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`)
  return { budgetPath, section, budget }
}

function displayPath(root, path) {
  const value = relative(root, path)
  return value || '.'
}

function parseArguments(argv) {
  const [mode, ...rest] = argv
  if (!['--init', '--check'].includes(mode ?? '')) return null
  let section = 'all'
  for (const argument of rest) {
    const match = /^--section=(.+)$/.exec(argument)
    if (mode !== '--init' || !match || !BUNDLE_BUDGET_SECTIONS.includes(match[1])) return null
    section = match[1]
  }
  return { mode, section }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args) {
    console.error(`用法: node scripts/check-bundle-size.mjs --check | --init [--section=${BUNDLE_BUDGET_SECTIONS.join('|')}]`)
    process.exitCode = 1
    return
  }

  try {
    if (args.mode === '--init') {
      const result = runBundleSizeInit({ section: args.section })
      const written = []
      if (args.section !== 'size-limit') written.push(`原始 byte:total budget ${result.budget.totalKB}KB + top-${BUNDLE_SIZE_TOP_N} entries`)
      if (args.section !== 'raw') written.push(`sizeLimit:${result.budget.sizeLimit.checks.map((check) => `${check.name.replace(/[(（].*$/, '')} ${check.limit}`).join('、')}`)
      console.log(`✅ budget 寫入 ${displayPath(DEFAULT_ROOT, result.budgetPath)}(${written.join(';')})`)
      return
    }
    const result = checkBundleSize({
      distDir: join(DEFAULT_ROOT, 'packages/design-system/dist'),
      budgetPath: join(DEFAULT_ROOT, BUNDLE_BUDGET_PATH),
    })
    const source = await checkSizeLimitConfigSource()
    if (!result.ok || !source.ok) {
      console.error('❌ bundle-size gate FAIL:')
      for (const failure of [...result.failures, ...source.failures]) console.error(`   - ${failure}`)
      if (!result.ok) {
        console.error('   蓄意增大(新元件/新依賴)→ node scripts/check-bundle-size.mjs --init 更新 budget(原始 byte 與 sizeLimit 兩段一起)+ commit 說明;')
        console.error('   非蓄意 → 查新增 import(lucide 全庫 / 重複依賴,見 performance-audit SKILL Phase 3)。')
      }
      process.exitCode = 1
      return
    }
    console.log(`✅ bundle-size gate PASS(total ${bundleKilobytes(result.totalBytes)}KB ≤ ${result.budget.totalKB}KB;top-${BUNDLE_SIZE_TOP_N} entries 全部在 budget 內;size-limit 只讀 ${SIZE_LIMIT_CONFIG_FILE} 推導的 ${result.budget.sizeLimit.checks.length} 項)`)
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
