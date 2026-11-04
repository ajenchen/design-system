import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

export const GATE_META_TEST_EXCLUSIONS = 'scripts/gate-meta-test-exclusions.json'
export const GATE_META_TEST_EXECUTION_CLASSES = Object.freeze([
  'deterministic-isolated',
  'environmental-observation',
])

export function isCheckerGateFile(file) {
  const checker = /^(audit|check)-.*\.mjs$/.test(file)
    || /-invariant\.mjs$/.test(file)
    || /-coherence\.mjs$/.test(file)
    || /-invariants\.mjs$/.test(file)
  const exempt = /^gen-/.test(file)
    || /^test-/.test(file)
    || /^sync-/.test(file)
    || /\.baseline\.json$/.test(file)
    || file === 'audit-gate-meta-test-coverage.mjs'
  return checker && !exempt
}

export function discoverCheckerGates(root) {
  return readdirSync(join(resolve(root), 'scripts'))
    .filter(file => file.endsWith('.mjs') && isCheckerGateFile(file))
    .sort()
}

const ENTRY_KEYS = [
  'executionClass',
  'executionOwner',
  'fallback',
  'harness',
  'portabilityPolicy',
  'reason',
  'stem',
]

function fail(message) {
  throw new Error(`invalid gate meta-test exclusion inventory:${message}`)
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be exactly ${wanted.join(',')};got ${actual.join(',')}`)
  }
}

function readJson(path, label) {
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} is not readable JSON:${error.message}`)
  }
  return value
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`)
}

export function discoverGateMetaTestPairs(root) {
  const scripts = join(resolve(root), 'scripts')
  return readdirSync(scripts)
    .filter((file) => /^test-.+\.mjs$/.test(file))
    .map((file) => ({ file, stem: file.replace(/^test-/, '').replace(/\.mjs$/, '') }))
    .filter(({ stem }) => existsSync(join(scripts, `${stem}.mjs`)))
    .sort((left, right) => compareUtf8Bytes(left.file, right.file))
}

function validateOwner(root, entry) {
  const owner = entry.executionOwner
  assertNonEmptyString(owner?.kind, `${entry.stem}.executionOwner.kind`)
  assertNonEmptyString(owner?.path, `${entry.stem}.executionOwner.path`)
  if (owner?.kind !== 'harness-registry') {
    assertNonEmptyString(owner?.evidence, `${entry.stem}.executionOwner.evidence`)
  }
  if (isAbsolute(owner.path) || owner.path.includes('\\')) {
    fail(`${entry.stem} execution owner path must be portable and repository-relative:${owner.path}`)
  }
  const ownerPath = resolve(root, owner.path)
  const ownerRelative = relative(root, ownerPath)
  if (ownerRelative === '..' || ownerRelative.startsWith(`..${sep}`) || isAbsolute(ownerRelative)) {
    fail(`${entry.stem} execution owner path escapes the repository:${owner.path}`)
  }
  if (!existsSync(ownerPath)) fail(`${entry.stem} execution owner path does not exist:${owner.path}`)

  if (owner.kind === 'package-script') {
    assertExactKeys(owner, ['kind', 'path', 'script', 'evidence'], `${entry.stem}.executionOwner`)
    assertNonEmptyString(owner.script, `${entry.stem}.executionOwner.script`)
    const packageJson = readJson(ownerPath, `${entry.stem} execution owner`)
    const command = packageJson.scripts?.[owner.script]
    if (typeof command !== 'string') fail(`${entry.stem} owner script is missing:${owner.script}`)
    if (!command.split(/\s*&&\s*/).includes(owner.evidence)) {
      fail(`${entry.stem} owner script ${owner.script} lacks evidence:${owner.evidence}`)
    }
    return
  }

  if (owner.kind === 'source-reference') {
    assertExactKeys(owner, ['kind', 'path', 'evidence'], `${entry.stem}.executionOwner`)
    if (!readFileSync(ownerPath, 'utf8').includes(owner.evidence)) {
      fail(`${entry.stem} owner source lacks evidence:${owner.evidence}`)
    }
    return
  }

  if (owner.kind === 'harness-registry') {
    assertExactKeys(owner, ['kind', 'path', 'command'], `${entry.stem}.executionOwner`)
    if (!Array.isArray(owner.command)
      || owner.command.length < 2
      || owner.command.some(token => typeof token !== 'string' || !token)) {
      fail(`${entry.stem} harness-registry owner command must be a non-empty argv array`)
    }
    const registry = readJson(ownerPath, `${entry.stem} execution owner`)
    const commandKey = JSON.stringify(owner.command)
    const matches = (registry.entries ?? [])
      .flatMap(candidate => candidate.commands ?? [])
      .filter(command => JSON.stringify(command) === commandKey)
    if (matches.length !== 1) {
      fail(`${entry.stem} harness-registry owner must register the exact command once;got ${matches.length}`)
    }
    return
  }

  fail(`${entry.stem} has unsupported execution owner kind:${owner.kind}`)
}

function validateExclusion(root, entry, discoverableByStem) {
  assertExactKeys(entry, ENTRY_KEYS, `entry ${entry?.stem ?? '<unknown>'}`)
  if (typeof entry.stem !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.stem)) {
    fail(`entry stem is invalid:${entry.stem}`)
  }
  const pair = discoverableByStem.get(entry.stem)
  if (!pair) fail(`${entry.stem} is inert:there is no scripts/${entry.stem}.mjs + scripts/test-${entry.stem}.mjs pair`)
  if (entry.harness !== `scripts/${pair.file}`) {
    fail(`${entry.stem} harness must identify its discovered pair:scripts/${pair.file}`)
  }
  assertNonEmptyString(entry.reason, `${entry.stem}.reason`)
  if (!GATE_META_TEST_EXECUTION_CLASSES.includes(entry.executionClass)) {
    fail(`${entry.stem} has unsupported execution class:${entry.executionClass}`)
  }

  if (entry.executionClass === 'deterministic-isolated') {
    if (entry.portabilityPolicy !== 'required' || entry.fallback !== null) {
      fail(`${entry.stem} deterministic exclusion must be portability-required with no fallback`)
    }
    if (entry.executionOwner?.kind !== 'harness-registry') {
      fail(`${entry.stem} deterministic exclusion must name the canonical harness-registry execution owner`)
    }
    if (JSON.stringify(entry.executionOwner?.command) !== JSON.stringify(['node', entry.harness])) {
      fail(`${entry.stem} deterministic owner command must execute exactly node ${entry.harness}`)
    }
  } else {
    if (entry.portabilityPolicy !== 'excluded' || typeof entry.fallback !== 'string' || !entry.fallback.trim()) {
      fail(`${entry.stem} environmental observation must be portability-excluded with an explicit fallback`)
    }
    if (entry.executionOwner?.kind !== 'source-reference') {
      fail(`${entry.stem} environmental observation must name a source-reference owner`)
    }
  }
  validateOwner(root, entry)
}

export function createGateMetaTestInventory({
  root,
  exclusionDocument,
  exclusionPath,
} = {}) {
  assertNonEmptyString(root, 'repository root')
  const repositoryRoot = resolve(root)
  const discoverable = discoverGateMetaTestPairs(repositoryRoot)
  const inventoryPath = exclusionPath ?? join(repositoryRoot, GATE_META_TEST_EXCLUSIONS)
  const document = exclusionDocument ?? readJson(inventoryPath, GATE_META_TEST_EXCLUSIONS)
  assertExactKeys(document, ['entries', 'schemaVersion'], 'inventory document')
  if (document.schemaVersion !== 2) fail(`schemaVersion must be 2;got ${document.schemaVersion}`)
  if (!Array.isArray(document.entries)) fail('entries must be an array')

  const discoverableByStem = new Map(discoverable.map((pair) => [pair.stem, pair]))
  const entries = [...document.entries].sort((left, right) => compareUtf8Bytes(left.stem, right.stem))
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry?.stem)) fail(`duplicate exclusion stem:${entry.stem}`)
    seen.add(entry?.stem)
    validateExclusion(repositoryRoot, entry, discoverableByStem)
  }

  const excludedByStem = new Map(entries.map((entry) => [entry.stem, entry]))
  const runnable = discoverable.filter(({ stem }) => !excludedByStem.has(stem))
  const excludedByClass = Object.fromEntries(GATE_META_TEST_EXECUTION_CLASSES.map((name) => [name, []]))
  for (const entry of entries) excludedByClass[entry.executionClass].push(entry)

  return {
    discoverable,
    runnable,
    excluded: entries,
    excludedByClass,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Gate meta-test lanes(2026-10-14,待辦總帳 SM2)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼要分 lane**:`scripts/run-gate-meta-tests.mjs` 原本把全部 meta-test 一支接一支跑在**一個**
// 45 分鐘上限底下(harness-registry timeoutMs 2700000),輸出全部存到最後才印。支數 64 → 147、而且快照裡
// 第 53 支 `test-data-table-invariants` 會順手 build storybook,排在它後面的瀏覽器 meta-test 從「略過」變成真跑
// —— 09-22 → 09-28 連 7 晚在 2,700,222 ~ 2,706,603 ms 被外層砍掉,零診斷,8 個 domain 一起紅。
//
// 現在的契約(單一住所:`infra/governance/providers/harness-source-inventory.json` 的 `pairedMeta`,
// 驗證與判讀只有這一份實作 —— harness 驗證、同步產生器、runner 三處都呼叫這裡):
//   · 每支 meta-test **恰好屬於一個 lane**;lane 各自是一條 harness 指令
//     `node scripts/run-gate-meta-tests.mjs --lane <id>`,各自一個拋棄式快照、各自一個外層上限。
//   · `membership: "remainder"` 的 lane(恰好一個,storybook 必須是 absent)收「沒宣告在別的 lane 的全部」,
//     成員由 `npm run governance:generate` 產生;其餘 lane 的成員是**人寫的宣告**。
//   · `storybook: "lane-build"` 的 lane 由 runner 在快照裡**先 build 一次** storybook(build:lib + build-storybook,
//     預算 `storybookBuildTimeoutMs`),並宣告 GOVERNANCE_BROWSER_REQUIRED=1 —— 缺建置 / 起不了瀏覽器一律紅。
//     `storybook: "absent"` 的 lane 保證快照裡**沒有** storybook-static;在那裡印「缺 storybook-static」的
//     meta-test = 放錯 lane,紅,並指名該搬去哪裡(不再是「計在 pass 的略過」)。
//   · 單支預算 = `memberTimeoutOverrides` 裡寫的值,沒寫就是 lane 的 `memberTimeoutMs`(明文,不再是環境變數預設)。
//     超過 → runner 終止那支的整個行程群組並**當場**印出它的名字。
//   · lane 預算 `totalTimeoutMs` 從 runner 啟動起算(含建快照、build storybook、清理保留)。runner 自己守這條線:
//     每支拿 min(單支預算, lane 剩餘),lane 剩餘用完的當下印出「是在跑哪一支時用完的」與沒跑到的清單。
//     harness 外層上限 = totalTimeoutMs + GATE_META_LANE_OUTER_RESERVE_MS(與 suite 同一條規則),
//     所以外層的砍殺永遠不會比 runner 自己的判定先到 —— lane 不可能無聲地超過自己的上限。
export const GATE_META_TEST_RUNNER = 'scripts/run-gate-meta-tests.mjs'
export const GATE_META_LANE_STORYBOOK_MODES = Object.freeze(['absent', 'lane-build'])
export const GATE_META_LANE_MEMBERSHIPS = Object.freeze(['declared', 'remainder'])
// runner 內部在 lane 截止前留給「移除快照 + 印摘要」的時間;外層再多留 60 秒(同 suite 的 +60 秒規則)。
export const GATE_META_LANE_CLEANUP_RESERVE_MS = 120_000
export const GATE_META_LANE_OUTER_RESERVE_MS = 60_000
const LANE_ID = /^[a-z][a-z0-9-]*$/
const META_TEST_PATH = /^scripts\/test-[A-Za-z0-9._-]+\.mjs$/
const MIN_BUDGET_MS = 1_000
const MAX_LANE_TOTAL_MS = 21_600_000 - GATE_META_LANE_OUTER_RESERVE_MS

function laneFail(message) {
  throw new Error(`invalid gate meta-test lanes:${message}`)
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareUtf8Bytes)
}

function assertLaneExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) laneFail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) laneFail(`${label} keys must be exactly ${wanted.join(',')};got ${actual.join(',')}`)
}

function assertSortedUniqueList(values, label) {
  if (!Array.isArray(values)) laneFail(`${label} must be an array`)
  if (JSON.stringify(values) !== JSON.stringify(sortedUnique(values))) laneFail(`${label} must be sorted (UTF-8 bytes) and unique`)
}

function assertBudget(value, label, maximum) {
  if (!Number.isInteger(value) || value < MIN_BUDGET_MS || value > maximum) {
    laneFail(`${label} must be an integer between ${MIN_BUDGET_MS} and ${maximum} ms;got ${JSON.stringify(value)}`)
  }
}

export function gateMetaLaneCommand(laneId) {
  if (typeof laneId !== 'string' || !LANE_ID.test(laneId)) laneFail(`lane id is invalid:${JSON.stringify(laneId)}`)
  return ['node', GATE_META_TEST_RUNNER, '--lane', laneId]
}

export function isGateMetaLaneCommand(command) {
  return Array.isArray(command)
    && command.length === 4
    && command[0] === 'node'
    && command[1] === GATE_META_TEST_RUNNER
    && command[2] === '--lane'
    && typeof command[3] === 'string'
    && LANE_ID.test(command[3])
}

function laneKeys(lane) {
  const base = ['id', 'storybook', 'membership', 'memberTimeoutMs', 'memberTimeoutOverrides', 'totalTimeoutMs', 'members']
  return lane?.storybook === 'lane-build' ? [...base, 'storybookBuildTimeoutMs'] : base
}

/**
 * 驗證 lane 宣告的形狀與預算(不看成員是否等於現行 inventory —— 那一步在 validateGateMetaLanes)。
 * @returns {{ runner: string, lanes: object[] }} 原物件(驗過)
 */
function validateGateMetaLaneShapes(pairedMeta) {
  assertLaneExactKeys(pairedMeta, ['runner', 'lanes'], 'pairedMeta')
  if (pairedMeta.runner !== GATE_META_TEST_RUNNER) laneFail(`pairedMeta.runner must be ${GATE_META_TEST_RUNNER}`)
  if (!Array.isArray(pairedMeta.lanes) || pairedMeta.lanes.length === 0) laneFail('pairedMeta.lanes must be a non-empty array')
  const ids = pairedMeta.lanes.map(lane => lane?.id)
  assertSortedUniqueList(ids, 'lane ids')
  const remainder = pairedMeta.lanes.filter(lane => lane?.membership === 'remainder')
  if (remainder.length !== 1) laneFail(`exactly one lane must have membership "remainder";got ${remainder.length}`)
  if (remainder[0].storybook !== 'absent') {
    laneFail(`remainder lane ${remainder[0].id} must be storybook "absent" —— 沒宣告的 meta-test 不得在預設 lane 裡默默拿到建置`)
  }
  for (const lane of pairedMeta.lanes) {
    assertLaneExactKeys(lane, laneKeys(lane), `lane ${lane?.id ?? '<missing>'}`)
    if (!LANE_ID.test(lane.id)) laneFail(`lane id is invalid:${JSON.stringify(lane.id)}`)
    if (!GATE_META_LANE_STORYBOOK_MODES.includes(lane.storybook)) laneFail(`lane ${lane.id} storybook mode is invalid:${JSON.stringify(lane.storybook)}`)
    if (!GATE_META_LANE_MEMBERSHIPS.includes(lane.membership)) laneFail(`lane ${lane.id} membership is invalid:${JSON.stringify(lane.membership)}`)
    assertBudget(lane.totalTimeoutMs, `lane ${lane.id} totalTimeoutMs`, MAX_LANE_TOTAL_MS)
    assertBudget(lane.memberTimeoutMs, `lane ${lane.id} memberTimeoutMs`, lane.totalTimeoutMs)
    const buildBudget = lane.storybook === 'lane-build' ? lane.storybookBuildTimeoutMs : 0
    if (lane.storybook === 'lane-build') assertBudget(buildBudget, `lane ${lane.id} storybookBuildTimeoutMs`, lane.totalTimeoutMs)
    assertSortedUniqueList(lane.members, `lane ${lane.id} members`)
    if (lane.membership === 'declared' && lane.members.length === 0) laneFail(`declared lane ${lane.id} has no members`)
    for (const member of lane.members) {
      if (typeof member !== 'string' || !META_TEST_PATH.test(member)) laneFail(`lane ${lane.id} member is not a scripts/test-*.mjs path:${JSON.stringify(member)}`)
    }
    if (!Array.isArray(lane.memberTimeoutOverrides)) laneFail(`lane ${lane.id} memberTimeoutOverrides must be an array`)
    assertSortedUniqueList(lane.memberTimeoutOverrides.map(override => override?.path), `lane ${lane.id} memberTimeoutOverrides paths`)
    const members = new Set(lane.members)
    let largest = lane.memberTimeoutMs
    for (const override of lane.memberTimeoutOverrides) {
      assertLaneExactKeys(override, ['path', 'timeoutMs'], `lane ${lane.id} memberTimeoutOverride`)
      if (!members.has(override.path)) laneFail(`lane ${lane.id} overrides the budget of a non-member:${override.path}`)
      assertBudget(override.timeoutMs, `lane ${lane.id} budget for ${override.path}`, lane.totalTimeoutMs)
      if (override.timeoutMs === lane.memberTimeoutMs) laneFail(`lane ${lane.id} override for ${override.path} repeats the lane default`)
      largest = Math.max(largest, override.timeoutMs)
    }
    // 最大的那一支在 build 之後仍拿得到它的完整單支預算,並留得下清理時間 —— 否則那支的預算只是寫好看的。
    const floor = buildBudget + largest + GATE_META_LANE_CLEANUP_RESERVE_MS
    if (floor > lane.totalTimeoutMs) {
      laneFail(`lane ${lane.id} totalTimeoutMs ${lane.totalTimeoutMs} cannot fit storybook build ${buildBudget} + largest per-test budget ${largest} + cleanup reserve ${GATE_META_LANE_CLEANUP_RESERVE_MS}`)
    }
  }
  return pairedMeta
}

/**
 * 完整驗證:形狀、預算,而且全部 lane 的成員**恰好**分割 runnable(不多、不少、不重疊)。
 * @param {object} pairedMeta harness-source-inventory.json 的 pairedMeta
 * @param {{ runnablePaths: string[] }} options 現行 gate-meta inventory 的 runnable(`scripts/test-*.mjs`)
 */
export function validateGateMetaLanes(pairedMeta, { runnablePaths } = {}) {
  validateGateMetaLaneShapes(pairedMeta)
  if (!Array.isArray(runnablePaths)) laneFail('runnable gate meta-test paths are required')
  const expected = sortedUnique(runnablePaths)
  const owner = new Map()
  for (const lane of pairedMeta.lanes) {
    for (const member of lane.members) {
      if (owner.has(member)) laneFail(`${member} is declared in two lanes:${owner.get(member)} and ${lane.id}`)
      owner.set(member, lane.id)
    }
  }
  const runnable = new Set(expected)
  const stale = [...owner.keys()].filter(path => !runnable.has(path)).sort(compareUtf8Bytes)
  if (stale.length) laneFail(`lane members are not runnable gate meta-tests (renamed, removed or excluded):${stale.map(path => `${path}@${owner.get(path)}`).join(', ')}`)
  const unowned = expected.filter(path => !owner.has(path))
  if (unowned.length) laneFail(`runnable gate meta-tests are in no lane (run npm run governance:generate):${unowned.join(', ')}`)
  return pairedMeta
}

/**
 * governance:generate 用:remainder lane 的成員 = runnable − 其他 lane 的宣告;宣告裡有不再 runnable 的成員 → 丟例外點名
 * (不默默丟掉:被改名的瀏覽器 meta-test 若被掉進 remainder,會在沒有建置的 lane 裡紅 —— 要人重新宣告)。
 */
export function synchronizeGateMetaLaneMembers(pairedMeta, { runnablePaths } = {}) {
  const next = structuredClone(pairedMeta)
  if (!Array.isArray(next?.lanes)) laneFail('pairedMeta.lanes must be a non-empty array')
  const remainders = next.lanes.filter(lane => lane?.membership === 'remainder')
  if (remainders.length !== 1) laneFail(`exactly one lane must have membership "remainder";got ${remainders.length}`)
  const declared = new Set(next.lanes
    .filter(lane => lane !== remainders[0])
    .flatMap(lane => (Array.isArray(lane?.members) ? lane.members : [])))
  remainders[0].members = sortedUnique(runnablePaths ?? []).filter(path => !declared.has(path))
  return validateGateMetaLanes(next, { runnablePaths })
}

/** 每支成員的明文單支預算(override 優先,否則 lane 預設)。 */
export function gateMetaLaneMemberBudgets(lane) {
  const overrides = new Map(lane.memberTimeoutOverrides.map(override => [override.path, override.timeoutMs]))
  return lane.members.map(path => ({ path, budgetMs: overrides.get(path) ?? lane.memberTimeoutMs }))
}
