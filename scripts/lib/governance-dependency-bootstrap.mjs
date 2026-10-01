import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertVerifiedExactNpmRuntimeCapability,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmRuntimeContract,
} from './verified-exact-npm-runtime.mjs'
import {
  materializeClosedHookToolProfile,
} from './closed-tool-execution.mjs'

export const GOVERNANCE_DEPENDENCY_REGISTRY = 'https://registry.npmjs.org/'
export const GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION = '22.13.0'
export const GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION = '11.19.0'
export const GOVERNANCE_CLOSED_PROJECT_NPM_CONFIG_LINES = Object.freeze([
  'legacy-peer-deps=true',
  'ignore-scripts=true',
])
export const GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES = Object.freeze(['bash', 'git', 'jq', 'python3'])
export const GOVERNANCE_DEPENDENCY_NPM_STEPS = Object.freeze([
  Object.freeze(['ci', '--legacy-peer-deps', '--ignore-scripts', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', 'signatures', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
  Object.freeze(['audit', '--audit-level=high', '--json', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
])

// 2026-09-23:歷史參考樹(視覺回歸重拍把 8/5 的 commit 放到同一個容器重拍,run #291)永遠無法滿足「今天」的弱點
// 資料庫 —— 那棵樹的相依是八月鎖定的,之後才登記的 advisory(baseline-browser-mapping 2.10.43)它不可能修。
// 完整性(lock 精確安裝 / 簽章 / attestation)照舊 fail closed;只有弱點稽核在「只報告」政策下改為「跑、印、記進 receipt、不擋」。
// 每個只報告政策都要說出**為什麼這棵樹可以不擋**,receipt 與 log 印的是那個理由,不得借用別的政策名(2026-09-29 OE6:anchor
// 借 render-only 的名字,receipt 就會寫「歷史參考樹、渲染容器」,而它裝的其實是 protected main 的樹)。預設仍是 enforce。
//   report-render-only-reference:歷史參考樹,無憑證、用完即丟的渲染容器(視覺回歸重拍,workflow 明文指定)。
//   report-protected-base-verifier:governance-anchor 裝 protected main 的相依樹只為執行驗證程式;這棵樹的弱點 base 自己的
//     required CI 已擋過,而候選**新增**的弱點由 install-candidate-dependencies.mjs 對 base / 候選各跑 npm audit 取差集
//     (GOV-CANDIDATE-DEPS-002)來擋 —— 在這裡 enforce 只會讓「認列新 advisory 形狀」的修復 PR 自己過不了(自鎖,M36(b))。
const REPORT_ONLY_VULNERABILITY_POLICIES = Object.freeze({
  'report-render-only-reference': Object.freeze({
    marker: 'GOV-RENDER-ONLY-REFERENCE',
    kind: 'render-only-reference-vulnerability-audit-receipt',
    why: '歷史參考樹,無憑證、用完即丟的渲染容器',
  }),
  'report-protected-base-verifier': Object.freeze({
    marker: 'GOV-PROTECTED-BASE-VERIFIER',
    kind: 'protected-base-verifier-vulnerability-audit-receipt',
    why: 'protected main 的相依樹只供驗證程式執行,候選新增的弱點另由 GOV-CANDIDATE-DEPS-002 差集擋',
  }),
})
export const GOVERNANCE_VULNERABILITY_POLICIES = Object.freeze(['enforce', ...Object.keys(REPORT_ONLY_VULNERABILITY_POLICIES)])

export function runVulnerabilityAuditUnderPolicy(policy, run, {
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  report = (line) => console.error(line),
} = {}) {
  invariant(GOVERNANCE_VULNERABILITY_POLICIES.includes(policy), `unsupported vulnerability policy:${String(policy)}`, errorPrefix)
  invariant(typeof run === 'function', 'vulnerability audit runner must be callable', errorPrefix)
  if (policy === 'enforce') return run()
  const reportOnly = REPORT_ONLY_VULNERABILITY_POLICIES[policy]
  try {
    return run()
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 600)
    report(`⚠️  ${reportOnly.marker}:弱點稽核只報告、不擋(${reportOnly.why}):${reason}`)
    return Object.freeze({
      schemaVersion: 1,
      kind: reportOnly.kind,
      status: 'reported-not-enforced',
      policy,
      reason,
    })
  }
}

const CREDENTIAL_NAME = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|API_KEY|ACCESS_KEY(?:_ID)?|AUTH_TOKEN)$/i
const HOSTILE_NAME = /^(?:ALL_PROXY|BASH_ENV|CURL_HOME|DYLD_|ENV$|GIT_|GH_|HTTPS?_PROXY|LD_|NETRC$|NODE_AUTH_TOKEN$|NODE_EXTRA_CA_CERTS$|NODE_OPTIONS$|NODE_PATH$|NODE_TLS_REJECT_UNAUTHORIZED$|NO_PROXY$|NPM_CONFIG_|npm_config_|NPM_TOKEN$|OPENAI_API_KEY$|ANTHROPIC_API_KEY$|PERL5OPT$|PLAYWRIGHT_|PYTHONHOME$|PYTHONPATH$|RUBYOPT$|SSH_|SSL_CERT_DIR$|SSL_CERT_FILE$|all_proxy$|https?_proxy$|no_proxy$)/

function invariant(condition, message, prefix = 'GOV-DEPENDENCY-BOOTSTRAP-001') {
  if (!condition) throw new Error(`${prefix}:${message}`)
}

function stableVersionAtLeast(value, minimum) {
  const parse = (version) => typeof version === 'string'
    ? version.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/)?.slice(1, 4).map(Number)
    : null
  const observed = parse(value)
  const required = parse(minimum)
  if (!observed || !required) return false
  for (let index = 0; index < 3; index += 1) {
    if (observed[index] !== required[index]) return observed[index] > required[index]
  }
  return true
}

function regularBytes(root, path, prefix) {
  const absolute = join(root, path)
  const info = lstatSync(absolute)
  invariant(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute,
    `bootstrap authority path must be one regular no-link file:${path}`,
    prefix,
  )
  return readFileSync(absolute)
}

export function assertClosedProjectNpmConfig(rootPath, expectedLines, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  invariant(Array.isArray(expectedLines) && expectedLines.length > 0 && expectedLines.every((line) => typeof line === 'string' && line.length > 0), '.npmrc expected lines are invalid', errorPrefix)
  const lines = regularBytes(root, '.npmrc', errorPrefix).toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  invariant(JSON.stringify(lines) === JSON.stringify(expectedLines), `.npmrc must contain only the canonical settings:${expectedLines.join(',')}`, errorPrefix)
  return lines
}

export function assertNoRootNpmShrinkwrap(rootPath, { errorPrefix = 'GOV-DEPENDENCY-LOCK-001' } = {}) {
  const root = realpathSync(resolve(rootPath))
  const shrinkwrap = join(root, 'npm-shrinkwrap.json')
  let present = false
  try {
    lstatSync(shrinkwrap)
    present = true
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  invariant(
    !present,
    'root npm-shrinkwrap.json is forbidden; authenticated package-lock.json is the sole dependency lock authority',
    errorPrefix,
  )
  return root
}

export function sanitizeGovernanceBootstrapEnvironment(baseEnvironment = process.env) {
  return Object.fromEntries(Object.entries(baseEnvironment).filter(([name, value]) => (
    value !== undefined && !CREDENTIAL_NAME.test(name) && !HOSTILE_NAME.test(name)
  )))
}

export function assertGovernanceBootstrapRuntime({
  platform = process.platform,
  nodeVersion = process.versions.node,
  runner = spawnSync,
  nodeExecutable = process.execPath,
  repoRoot,
  toolProfileFactory = materializeClosedHookToolProfile,
  errorPrefix,
} = {}) {
  invariant(platform === 'darwin' || platform === 'linux', 'native Windows is unsupported; use WSL2 or the committed Linux dev container', errorPrefix)
  invariant(stableVersionAtLeast(nodeVersion, GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION), `Node.js ${GOVERNANCE_DEPENDENCY_MINIMUM_NODE_VERSION} or newer is required; received ${String(nodeVersion)}`, errorPrefix)
  const profile = toolProfileFactory({
    nodeExecutable,
    ...(repoRoot === undefined ? {} : { repoRoot: realpathSync(resolve(repoRoot)) }),
    runtimePlatform: platform,
  })
  invariant(profile && typeof profile.verify === 'function', 'closed prerequisite tool profile is unavailable', errorPrefix)
  profile.verify()
  const closedEnvironment = {
    HOME: profile.homeDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
    PATH: profile.executablePath,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    TMPDIR: profile.tempDirectory,
    XDG_CONFIG_HOME: profile.homeDirectory,
  }
  const missing = []
  for (const executable of GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES) {
    const capability = profile.executables?.[executable]
    if (typeof capability !== 'string' || !capability.startsWith(`${profile.root}/`)) {
      missing.push(executable)
      continue
    }
    profile.verify()
    const result = runner(capability, ['--version'], {
      env: closedEnvironment,
      shell: false,
      stdio: 'ignore',
      timeout: 5_000,
      windowsHide: true,
    })
    profile.verify()
    if (result?.error || result?.status !== 0) missing.push(executable)
  }
  invariant(missing.length === 0, `missing required setup executables: ${missing.join(', ')}`, errorPrefix)
  const result = {
    platform,
    nodeVersion,
    executables: [...GOVERNANCE_DEPENDENCY_REQUIRED_EXECUTABLES],
  }
  Object.defineProperty(result, 'toolProfile', {
    enumerable: false,
    value: profile,
  })
  return Object.freeze(result)
}

export function captureBootstrapAuthority(rootPath, paths, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  invariant(Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length, 'bootstrap authority paths are invalid', errorPrefix)
  return Object.freeze(paths.map((path) => Object.freeze({ path, bytes: regularBytes(root, path, errorPrefix) })))
}

export function assertBootstrapAuthorityUnchanged(rootPath, snapshot, { errorPrefix } = {}) {
  const root = realpathSync(resolve(rootPath))
  for (const entry of snapshot) {
    invariant(regularBytes(root, entry.path, errorPrefix).equals(entry.bytes), `bootstrap install mutated committed setup authority:${entry.path}`, errorPrefix)
  }
}

export function createIsolatedGovernanceNpmEnvironment(baseEnvironment = process.env, {
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  toolProfile,
} = {}) {
  const configRoot = mkdtempSync(join(realpathSync(tmpdir()), 'qijenchen-governance-dependency-'))
  const userConfig = join(configRoot, 'user.npmrc')
  const globalConfig = join(configRoot, 'global.npmrc')
  try {
    const config = `registry=${GOVERNANCE_DEPENDENCY_REGISTRY}\nignore-scripts=true\nstrict-ssl=true\nalways-auth=false\n`
    writeFileSync(userConfig, config, { flag: 'wx', mode: 0o600 })
    writeFileSync(globalConfig, config, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    rmSync(configRoot, { recursive: true, force: true })
    throw error
  }
  const inherited = sanitizeGovernanceBootstrapEnvironment(baseEnvironment)
  if (toolProfile !== undefined) {
    invariant(toolProfile && typeof toolProfile.verify === 'function', 'closed prerequisite tool profile is invalid', errorPrefix)
    toolProfile.verify()
    inherited.HOME = toolProfile.homeDirectory
    inherited.PATH = toolProfile.executablePath
    inherited.TMPDIR = toolProfile.tempDirectory
    inherited.XDG_CONFIG_HOME = toolProfile.homeDirectory
  }
  invariant(typeof inherited.PATH === 'string' && inherited.PATH.length > 0, 'sanitized setup environment has no closed PATH', errorPrefix)
  return {
    env: {
      ...inherited,
      NPM_CONFIG_USERCONFIG: userConfig,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
      NPM_CONFIG_REGISTRY: GOVERNANCE_DEPENDENCY_REGISTRY,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_STRICT_SSL: 'true',
      NPM_CONFIG_ALWAYS_AUTH: 'false',
      NPM_CONFIG_AUDIT_LEVEL: 'high',
    },
    cleanup: () => rmSync(configRoot, { recursive: true, force: true }),
  }
}

export function runClosedBootstrapStep(command, args, {
  root,
  environment,
  runner = spawnSync,
  errorPrefix,
  timeoutMs = 15 * 60 * 1_000,
} = {}) {
  invariant(Number.isInteger(timeoutMs) && timeoutMs >= 1_000, 'bootstrap step timeout must be at least 1000ms', errorPrefix)
  const result = runner(command, args, {
    cwd: root,
    env: environment,
    shell: false,
    // npm progress lines are diagnostics, not program output. Callers such as
    // `sync-all.mjs --json` promise a machine-readable stdout, and an inherited fd 1 would
    // interleave npm chatter with that report (2026-08-06: a consumer upgrade applied
    // cleanly yet its workflow died on `jq: Invalid numeric literal` because `npm warn` and
    // `added 4 packages` landed in the report file). Route child stdout to this process's
    // stderr so the logs stay visible while stdout stays a closed machine channel.
    stdio: ['inherit', 2, 'inherit'],
    timeout: timeoutMs,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(Number.isInteger(result?.status), `${command} did not return an exit status`, errorPrefix)
  invariant(result.status === 0, `${command} ${args.join(' ')} failed with exit ${result.status}`, errorPrefix)
  return result
}

function exactArray(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
}

// Exactly the advisory set the registry serves today for the copy bundled inside npm 11.19.0.
// The disk copy is replaced with the fixed 5.0.12 by the security overlay; npm audit reads the
// LOCK, which still records the bundled 5.0.7, so the finding itself never disappears — it is
// acknowledged here in exact shape and any drift (another advisory, a new node) fails closed.
// 2026-08-04: GHSA-rgw5-rvv9-x895 landed (<5.0.9); overlay bumped 5.0.8 → 5.0.9 the same day.
// 2026-09-30: upstream published GHSA-6j4f-fj2g-mc7p (high, <5.0.10), GHSA-qhr7-859c-m2p7 (high, <5.0.11)
// and GHSA-q2hr-2g5m-vwhr (moderate, <5.0.12) at 2026-09-29T23:44Z. The 5.0.9 overlay AND the hoisted
// top-level copy were inside the new ranges, so this is a real remediation, not an acknowledgement:
// overlay + hoisted copy → 5.0.12 (published 2026-09-14). After the bump the only node left in the finding
// is npm's bundled copy that the overlay replaces on disk; minimatch is no longer an effect.
const VERIFIED_BRACE_EXPANSION_AUDIT_PREIMAGES = Object.freeze([
  Object.freeze({
    findingRange: '4.0.0 - 5.0.11',
    advisories: Object.freeze([
      Object.freeze({ source: 1130591, range: '>=4.0.0 <5.0.8', url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg', severity: 'high' }),
      Object.freeze({ source: 1130734, range: '>=4.0.0 <5.0.9', url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895', severity: 'high' }),
      Object.freeze({ source: 1240103, range: '>=4.0.0 <5.0.12', url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr', severity: 'moderate' }),
      Object.freeze({ source: 1240107, range: '>=4.0.0 <5.0.11', url: 'https://github.com/advisories/GHSA-qhr7-859c-m2p7', severity: 'high' }),
      Object.freeze({ source: 1240111, range: '>=4.0.0 <5.0.10', url: 'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p', severity: 'high' }),
    ]),
  }),
])

function matchesExactAdvisorySet(finding, name, advisories) {
  return Array.isArray(finding.via)
    && finding.via.length === advisories.length
    && advisories.every((advisory, index) => {
      const via = finding.via[index]
      return via?.source === advisory.source
        && via?.name === name
        && via?.dependency === name
        && via?.range === advisory.range
        && via?.url === advisory.url
        && via?.severity === advisory.severity
    })
}

function matchesVerifiedBraceExpansionAuditPreimage(finding) {
  return VERIFIED_BRACE_EXPANSION_AUDIT_PREIMAGES.some((preimage) => (
    finding.range === preimage.findingRange
      && matchesExactAdvisorySet(finding, 'brace-expansion', preimage.advisories)
  ))
}

// 帶出實際形狀(2026-09-04 立、2026-09-23 擴到每一個分支):只印名字的話,判斷「該修版本、該擴 overlay、
// 還是誤報」需要在本機重建一次同樣的樹才看得到 range 與路徑,而 CI 與本機的樹常常不一樣(fast-uri 就是這樣:
// 同一個 commit,`Verify` 5 筆、authority candidate 6 筆,多的那筆只有 CI 看得到)。2026-09-22 再一次:npm 那筆
// 的 range 字串因上游發版而變,閘只印「differs from the verified tar overlay closure」,本機系統 npm 的 audit
// 對這幾筆回的 range 是空字串,整個新字串只有 closed 安裝才看得到。這些欄位是版本範圍與 node_modules 路徑,不含憑證。
function describeFindingShape(finding) {
  return [
    `severity=${finding.severity}`,
    `range=${String(finding.range).slice(0, 120)}`,
    `nodes=${(Array.isArray(finding.nodes) ? finding.nodes : []).slice(0, 4).join('|') || '<none>'}`,
    `effects=${(Array.isArray(finding.effects) ? finding.effects : []).slice(0, 6).join('|') || '<none>'}`,
    `via=${(Array.isArray(finding.via) ? finding.via : []).map((v) => (typeof v === 'string' ? v : v?.url)).filter(Boolean).slice(0, 6).join('|') || '<none>'}`,
  ].join(' ')
}

// 2026-09-23:npm 那筆 metavulnerability 的 range 是 registry 依 npm 的**版本清單**算出來的,上游每發一個版本,
// 字串就變 —— 12.1.0 於 17:11Z 發布(帶修好的 tar),尾巴從 `>=12.0.0-pre.0.0` 變成 `12.0.0-pre.0.0 - 12.0.2`,
// 17:16Z 起 main 與每一支 PR 的 CI 全紅,直到有人重釘。整條字串是「當下剛好成立的觀察量」(M37),要保證的
// 性質只有三件:(1) 我們治理的 exact npm 仍被列為受影響(所以 overlay 必要);(2) 它的下一個 patch 不在範圍內
//(修好的 npm 存在,升級路徑仍成立);(3) 只經 tar 受影響(via)。下面直接驗這三件,不再釘與我們無關的 12.x 尾巴。
// 只接受 npm 產生 metavuln range 時會用到的子句形狀(`<=X` `<X` `>=X` `>X` `=X` `X` `A - B` `*`,子句間以 `||`
// 相接,子句內以空白相接),其他形狀一律 fail closed —— 這不是通用 semver,是這一筆稽核用得到的最小子集。
const GOVERNED_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const GOVERNED_COMPARATOR_PATTERN = /^(<=|>=|<|>|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/

export function parseGovernedVersion(text) {
  const match = GOVERNED_VERSION_PATTERN.exec(String(text).trim())
  invariant(match, `unsupported version in npm audit range:${String(text).slice(0, 40)}`)
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] === undefined ? null : match[4].split('.'),
  }
}

function comparePrereleaseIdentifiers(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1
    if (right[index] === undefined) return 1
    const leftNumeric = /^\d+$/.test(left[index])
    const rightNumeric = /^\d+$/.test(right[index])
    if (leftNumeric && rightNumeric) {
      const delta = Number(left[index]) - Number(right[index])
      if (delta !== 0) return delta < 0 ? -1 : 1
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1
    } else if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1
    }
  }
  return 0
}

export function compareGovernedVersions(leftText, rightText) {
  const left = parseGovernedVersion(leftText)
  const right = parseGovernedVersion(rightText)
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] < right.core[index] ? -1 : 1
  }
  if (left.prerelease === null && right.prerelease === null) return 0
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  return comparePrereleaseIdentifiers(left.prerelease, right.prerelease)
}

function comparatorCovers(comparator, version) {
  const match = GOVERNED_COMPARATOR_PATTERN.exec(comparator)
  invariant(match, `unsupported comparator in npm audit range:${comparator.slice(0, 40)}`)
  const delta = compareGovernedVersions(version, match[2])
  switch (match[1] ?? '=') {
    case '<=': return delta <= 0
    case '<': return delta < 0
    case '>=': return delta >= 0
    case '>': return delta > 0
    default: return delta === 0
  }
}

export function metavulnerabilityRangeCovers(range, version) {
  invariant(typeof range === 'string' && range.trim().length > 0, 'npm audit range must be a non-empty string')
  return range.split('||').some((clause) => {
    const text = clause.trim()
    if (text === '*') return true
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text)
    const comparators = hyphen ? [`>=${hyphen[1]}`, `<=${hyphen[2]}`] : text.split(/\s+/)
    return comparators.every((comparator) => comparatorCovers(comparator, version))
  })
}

export function nextPatchVersion(text) {
  const { core } = parseGovernedVersion(text)
  return `${core[0]}.${core[1]}.${core[2] + 1}`
}

function assertRemediatedFinding(name, finding) {
  invariant(finding && typeof finding === 'object' && !Array.isArray(finding), `npm audit finding is malformed:${name}`)
  invariant(finding.name === name, `npm audit finding identity drifted:${name}`)
  const shape = describeFindingShape(finding)
  if (name === 'brace-expansion') {
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/brace-expansion'])
        && Array.isArray(finding.effects)
        && finding.effects.length <= 1
        && finding.effects.every((effect) => effect === 'minimatch')
        && matchesVerifiedBraceExpansionAuditPreimage(finding),
      `npm audit brace-expansion finding differs from the exact remediated bundled preimage(${shape})`,
    )
    return
  }
  if (name === 'ip-address') {
    // Bundled inside npm 11.19.0 and NOT yet overlaid — unlike brace-expansion/tar, the disk copy
    // is still the vulnerable version. Acknowledged in exact shape only because no 11.x npm ships a
    // fix and the overlay machinery has no third slot yet; the fixed 10.4.0 exists, and extending
    // the overlay (or moving to npm 12) is tracked in the cloud-compat baton as the next branch.
    // DoS-class parsing advisories in dev-only npm CLI internals; nothing ships to production from
    // this tree. Any drift — a sixth advisory, a new node, a severity change — fails closed here.
    // 2026-09-29(待辦總帳 OE15):上游 2026-09-28 又發兩則 moderate(GHSA-rpw4-54j3-4h4q `Address6.isLinkLocal()`
    // 誤認 fe80::/64、GHSA-2vr4-cq9g-pvrc 沒有分類器認得 NAT64 64:ff9b::/96;都修在 10.5.1),finding.range 隨之
    // 從 <=10.3.0 變成 <=10.5.0、via 從 3 則變 5 則 —— 這道 exact-shape 認列當場把 CI 每個 job 都擋在
    // 「Install locked dependencies once」(這正是 OE6「新弱點通報會卡住所有 PR」的形狀)。bundled 的仍是 10.2.0、
    // npm 11.x 仍沒有帶 10.5.1 的版本,曝險與 08-03 那三則同類(dev-only CLI 內部的位址解析),所以只把新形狀認列進來;
    // 註:consumer 的同步永遠跑自己 protected main 上的這份腳本,新認列要靠受管檔案更新才會抵達 consumer。
    // 2026-09-30:上游 2026-09-29T23:46Z 再發兩則 moderate(GHSA-j6r3-76f7-8jcv isInSubnet 跨位址族比較、
    // GHSA-h3mg-xc3c-68pw Address6 解析診斷字串無長度上限;都修在 10.7.1),range 從 <=10.5.0 變 <=10.7.0、
    // via 從 5 則變 7 則。bundled 仍是 10.2.0、npm 11.x 仍無帶修正版的 release、修補層沒有這個 slot,
    // 曝險同類(dev-only CLI 內部的位址解析),照同一套只認列新形狀;舊的 5 則形狀由對照組判漂移。
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/ip-address'])
        && exactArray(finding.effects, [])
        && finding.range === '<=10.7.0'
        && matchesExactAdvisorySet(finding, 'ip-address', [
          { source: 1130722, range: '<=10.3.0', url: 'https://github.com/advisories/GHSA-mwp4-54f8-5fhr', severity: 'high' },
          { source: 1130723, range: '>=10.1.1 <=10.2.1', url: 'https://github.com/advisories/GHSA-4xrf-jv44-h6hh', severity: 'moderate' },
          { source: 1130724, range: '>=10.1.1 <=10.2.0', url: 'https://github.com/advisories/GHSA-22jq-vg5j-6vgg', severity: 'moderate' },
          { source: 1239948, range: '<=10.5.0', url: 'https://github.com/advisories/GHSA-rpw4-54j3-4h4q', severity: 'moderate' },
          { source: 1239949, range: '>=10.2.0 <=10.5.0', url: 'https://github.com/advisories/GHSA-2vr4-cq9g-pvrc', severity: 'moderate' },
          { source: 1240097, range: '<=10.7.0', url: 'https://github.com/advisories/GHSA-j6r3-76f7-8jcv', severity: 'moderate' },
          { source: 1240098, range: '<=10.7.0', url: 'https://github.com/advisories/GHSA-h3mg-xc3c-68pw', severity: 'moderate' },
        ]),
      `npm audit ip-address finding differs from the acknowledged bundled preimage(${shape})`,
    )
    return
  }
  if (name === 'undici') {
    // Same situation as ip-address: bundled in npm 11.19.0, no overlay slot yet, fixed 6.28.0
    // exists. Tracked in the cloud-compat baton; exact-shape acknowledgment, drift fails closed.
    // 2026-09-29(待辦總帳 OE15):上游 2026-09-28 再發 GHSA-3wwx-pv8p-q78v(moderate,DoS via unhandled error,
    // >=6.25.0 <6.28.1,修在 6.28.1),finding.range 從 <=6.27.0 變 <=6.28.0、via 從 3 則變 4 則 —— 與 ip-address 同一天
    // 同一種形狀,同樣只把新形狀認列進來(bundled 的 undici 仍是舊版、npm 11.x 沒有帶修正版的 release)。
    // 2026-09-30:上游 2026-09-29T18:21Z 又發兩則(GHSA-rfgv-xxqx-mfg5 **high**,DoS via unrequested WebSocket
    // subprotocol,>=6.7.0 <6.28.1;GHSA-r53p-7pc4-xj5r low,downstream response splitting via retry interceptor,
    // <6.28.1;都修在 6.28.1),finding.severity 隨之從 moderate 變 high、via 從 4 則變 6 則,range 不變 ——
    // #167 合併進 main 的那一輪(2eb5b433)16 個 job 全死在「Install locked dependencies once」,發布被 fail closed 擋下。
    // 曝險不變:bundled 6.27.0 只被 npm CLI 內部用、不進產品;仍只認列 exact shape,下一則再發照樣紅。
    // 根治(換到帶 undici ≥6.28.1 / ip-address ≥10.5.1 的 npm runtime,或給 overlay 加第三、四個 slot)在 cloud-compat baton。
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/undici'])
        && exactArray(finding.effects, [])
        && finding.range === '<=6.28.0'
        && matchesExactAdvisorySet(finding, 'undici', [
          { source: 1130716, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-8xcm-r25x-g524', severity: 'moderate' },
          { source: 1130727, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-m8rv-5g2x-5cg5', severity: 'moderate' },
          { source: 1130732, range: '<6.28.0', url: 'https://github.com/advisories/GHSA-v3r7-h72x-cjcm', severity: 'moderate' },
          { source: 1239934, range: '>=6.25.0 <6.28.1', url: 'https://github.com/advisories/GHSA-3wwx-pv8p-q78v', severity: 'moderate' },
          { source: 1240039, range: '<6.28.1', url: 'https://github.com/advisories/GHSA-r53p-7pc4-xj5r', severity: 'low' },
          { source: 1240042, range: '>=6.7.0 <6.28.1', url: 'https://github.com/advisories/GHSA-rfgv-xxqx-mfg5', severity: 'high' },
        ]),
      `npm audit undici finding differs from the acknowledged bundled preimage(${shape})`,
    )
    return
  }
  if (name === 'tar') {
    // 2026-08-28 upstream re-score: GHSA-r292-9mhp-454m moderate→high (CVSS 7.5), advisory source
    // renumbered 1124287→1145647, patched tar = 7.5.21. Our security overlay already ships 7.5.22,
    // so exposure is unchanged — this pins the re-scored registry shape, drift still fails closed.
    invariant(
      finding.severity === 'high'
        && finding.isDirect === false
        && exactArray(finding.nodes, ['node_modules/npm/node_modules/tar'])
        && exactArray(finding.effects, ['npm'])
        && finding.range === '<=7.5.20'
        && Array.isArray(finding.via)
        && finding.via.length === 1
        && finding.via[0]?.source === 1145647
        && finding.via[0]?.name === 'tar'
        && finding.via[0]?.dependency === 'tar'
        && finding.via[0]?.url === 'https://github.com/advisories/GHSA-r292-9mhp-454m'
        && finding.via[0]?.severity === 'high'
        && finding.via[0]?.range === '<=7.5.20',
      `npm audit tar finding differs from the exact remediated bundled preimage(${shape})`,
    )
    return
  }
  if (name === 'npm') {
    // Follows the tar re-score; npm 11.19.1 ships fixed tar, so the governed 11.19.0 must still be
    // listed and its next patch must not be (the fixed upgrade path exists). Moving to a fixed npm
    // stays tracked in the cloud-compat baton alongside ip-address/undici. The rest of the range
    // (10.x / 12.x clauses) describes versions we do not run and changes with every upstream
    // release — see the 2026-09-23 note above metavulnerabilityRangeCovers.
    const governed = GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION
    invariant(
      finding.severity === 'high'
        && finding.isDirect === true
        && exactArray(finding.via, ['tar'])
        && exactArray(finding.nodes, ['node_modules/npm'])
        && exactArray(finding.effects, [])
        && typeof finding.range === 'string'
        && metavulnerabilityRangeCovers(finding.range, governed)
        && !metavulnerabilityRangeCovers(finding.range, nextPatchVersion(governed)),
      `npm audit npm metavulnerability differs from the verified tar overlay closure(${shape})`,
    )
    return
  }
  invariant(false, `npm audit contains an unremediated high/moderate finding:${name}(${shape})`)
}

export function evaluateVerifiedHighVulnerabilityAudit({
  stdout,
  exitStatus,
  npmRuntime,
  installedOverlayReceipt,
} = {}) {
  invariant(
    npmRuntime?.securityOverlay?.status === 'applied'
      && installedOverlayReceipt?.status === 'verified'
      && installedOverlayReceipt.identityDigest === npmRuntime.securityOverlay.identityDigest
      && installedOverlayReceipt.treeDigest === npmRuntime.securityOverlay.treeDigest
      && /^[a-f0-9]{64}$/.test(installedOverlayReceipt.auditClosureDigest || '')
      && Array.isArray(installedOverlayReceipt.auditClosure),
    'npm audit cannot use the overlay evaluator without matching runtime and installed-tree receipts',
  )
  invariant(exitStatus === 0 || exitStatus === 1, `npm audit returned an invalid exit status:${String(exitStatus)}`)
  let report
  try { report = JSON.parse(String(stdout || '')) } catch {
    throw new Error('GOV-DEPENDENCY-BOOTSTRAP-001:npm audit did not produce closed JSON')
  }
  // 沒有 `auditReportVersion` 的東西一律**帶著實際內容**報,不要只說「schema is unsupported」
  // (2026-09-04):registry 的 advisory 服務掛掉時 `npm audit --json` 吐的是錯誤物件,例如
  // `{"message":"503 Service Unavailable - POST .../security/advisories/bulk","method":"POST","uri":...}`
  // —— 這個 JSON **parse 得過**,只是沒有 `auditReportVersion`,於是舊版一律報「格式不支援」,
  // 把基礎設施故障誤診成格式問題,下一個人會去查 npm 版本而不是重跑。
  // 這裡把「認得的錯誤形狀」與「認不得的東西」都變成可診斷的訊息:前者直接指名端點故障,
  // 後者附上頂層鍵名與有界前綴(稽核輸出是漏洞報告或錯誤物件,不含憑證;長度夾在 200 字元)。
  // 仍然 fail closed —— 沒有合格的稽核結果就不放行,改變的只有診斷品質。
  if (report && typeof report === 'object' && !Array.isArray(report) && report.auditReportVersion === undefined) {
    const summary = typeof report.message === 'string'
      ? `advisory endpoint failed:${report.message.slice(0, 200)}`
      : `unrecognised audit payload(keys:${Object.keys(report).slice(0, 12).join(',') || '<none>'})`
    throw new Error(`GOV-DEPENDENCY-BOOTSTRAP-001:npm audit ${summary}`)
  }
  invariant(
    report?.auditReportVersion === 2
      && report.vulnerabilities
      && typeof report.vulnerabilities === 'object'
      && !Array.isArray(report.vulnerabilities)
      && report.metadata?.vulnerabilities
      && typeof report.metadata.vulnerabilities === 'object',
    'npm audit JSON schema is unsupported',
  )
  const entries = Object.entries(report.vulnerabilities)
  const counted = { critical: 0, high: 0, moderate: 0 }
  const remediated = []
  for (const [name, finding] of entries) {
    if (finding?.severity === 'critical') {
      counted.critical += 1
      invariant(false, `npm audit contains an unremediated critical finding:${name}`)
    }
    if (finding?.severity === 'high') counted.high += 1
    else if (finding?.severity === 'moderate') counted.moderate += 1
    else continue
    assertRemediatedFinding(name, finding)
    remediated.push(name)
  }
  invariant(
    report.metadata.vulnerabilities.critical === counted.critical
      && report.metadata.vulnerabilities.high === counted.high
      && report.metadata.vulnerabilities.moderate === counted.moderate,
    'npm audit metadata severity counts differ from the finding set',
  )
  invariant(
    (counted.high === 0 && exitStatus === 0) || (counted.high > 0 && exitStatus === 1),
    'npm audit exit status differs from its high-severity finding set',
  )
  const rawBytes = Buffer.from(String(stdout || ''))
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-high-vulnerability-audit-receipt',
    status: 'passed',
    rawAuditSha256: createHash('sha256').update(rawBytes).digest('hex'),
    runtimeOverlayIdentity: npmRuntime.securityOverlay.identityDigest,
    runtimeOverlayTreeDigest: npmRuntime.securityOverlay.treeDigest,
    installedOverlayTreeDigest: installedOverlayReceipt.treeDigest,
    installedAuditClosureDigest: installedOverlayReceipt.auditClosureDigest,
    remediatedFindings: Object.freeze(remediated.sort()),
    effectiveCritical: 0,
    effectiveHigh: 0,
    effectiveModerate: 0,
  })
}

// 2026-09-24:`npm audit` 對 registry 的 advisory 端點是一次網路呼叫,共享 runner 上偶發 `read ECONNRESET` / 503
//(main d93284c1 那一輪的 dpr2 job 在任何閘跑之前就死在這一步;PAT 沒有 actions:write,不能重跑,只能再開一個 PR 合併
// 才有新的一輪)。只對「advisory 端點的暫時性網路錯誤」重試,上限 3 次、退避 2s/4s;真正的漏洞發現、格式錯誤、
// spawn 錯誤一律不重試;用盡仍 fail closed,訊息帶 attempts。判定抽成純函式 `isTransientAdvisoryEndpointFailure`,
// 測試兩面對照(該重試的一筆、不該重試的一筆)。
export const GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT = 3
export const GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS = 2_000
const TRANSIENT_ADVISORY_REASON = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|network timeout|\b50[234]\b/i
export function isTransientAdvisoryEndpointFailure(error) {
  const text = String(error?.message || '')
  return text.includes('npm audit advisory endpoint failed:') && TRANSIENT_ADVISORY_REASON.test(text)
}
const sleepSync = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }

export function runVerifiedHighVulnerabilityAudit(command, args, {
  root,
  environment,
  runner = spawnSync,
  npmRuntime,
  installedOverlayReceipt,
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  timeoutMs = 15 * 60 * 1_000,
  retryLimit = GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT,
  backoffMs = GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS,
  sleep = sleepSync,
  report = (line) => console.error(line),
} = {}) {
  invariant(
    Array.isArray(args)
      && typeof args[0] === 'string'
      && exactArray(args.slice(1), ['audit', '--audit-level=high', '--json', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`]),
    'npm high-vulnerability audit argv differs from the closed overlay-aware contract',
    errorPrefix,
  )
  invariant(Number.isInteger(retryLimit) && retryLimit >= 1, 'npm audit retry limit must be a positive integer', errorPrefix)
  for (let attempt = 1; ; attempt += 1) {
    const result = runner(command, args, {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      windowsHide: true,
    })
    if (result?.error) throw result.error
    invariant(Number.isInteger(result?.status), `${command} did not return an exit status`, errorPrefix)
    try {
      return evaluateVerifiedHighVulnerabilityAudit({
        stdout: result.stdout,
        exitStatus: result.status,
        npmRuntime,
        installedOverlayReceipt,
      })
    } catch (error) {
      if (!isTransientAdvisoryEndpointFailure(error)) throw error
      if (attempt >= retryLimit) {
        throw new Error(`${String(error.message)}(after ${attempt} attempts)`)
      }
      const wait = backoffMs * attempt
      report(`⚠️  ${errorPrefix}:npm audit advisory endpoint transient failure(attempt ${attempt}/${retryLimit}),retrying in ${wait}ms:${String(error.message).slice(0, 240)}`)
      sleep(wait)
    }
  }
}

// 渲染用參考樹(舊 commit、無憑證、用完即丟)可用它當時認證過的修補層版本;其餘政策 —— 一般安裝、
// protected-base verifier、consumer 同步 —— 一律只接受現行版本(verified-exact-npm-runtime.mjs 的歷史清單)。
// 判定表在 scripts/test-setup-governance.mjs。
export function acceptsHistoricalNpmOverlay(vulnerabilityPolicy) {
  return vulnerabilityPolicy === 'report-render-only-reference'
}

export async function runVerifiedGovernanceDependencyBootstrap({
  root: rootPath,
  platform = process.platform,
  nodeVersion = process.versions.node,
  baseEnvironment = process.env,
  runner = spawnSync,
  runtimeFactory = prepareVerifiedExactNpmRuntime,
  authorityPaths,
  expectedNpmrcLines,
  validateRoleRepository = () => {},
  afterStage = () => {},
  errorPrefix = 'GOV-DEPENDENCY-BOOTSTRAP-001',
  vulnerabilityPolicy = 'enforce',
} = {}) {
  invariant(GOVERNANCE_VULNERABILITY_POLICIES.includes(vulnerabilityPolicy), `unsupported vulnerability policy:${String(vulnerabilityPolicy)}`, errorPrefix)
  const root = realpathSync(resolve(rootPath))
  assertNoRootNpmShrinkwrap(root, { errorPrefix })
  const bootstrapRuntime = assertGovernanceBootstrapRuntime({
    platform,
    nodeVersion,
    runner,
    nodeExecutable: process.execPath,
    repoRoot: root,
    errorPrefix,
  })
  assertClosedProjectNpmConfig(root, expectedNpmrcLines, { errorPrefix })
  await validateRoleRepository(root)
  const historicalOverlay = acceptsHistoricalNpmOverlay(vulnerabilityPolicy)
  const expectedNpm = resolveExactNpmRuntimeContract(root, { historicalOverlay })
  invariant(expectedNpm.version === GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION, `npm runtime must remain exactly ${GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION}`, errorPrefix)
  const snapshot = captureBootstrapAuthority(root, authorityPaths, { errorPrefix })
  const isolated = createIsolatedGovernanceNpmEnvironment(baseEnvironment, {
    errorPrefix,
    toolProfile: bootstrapRuntime.toolProfile,
  })
  let npmRuntime = null
  let installedOverlayReceipt = null
  let auditReceipt = null
  try {
    npmRuntime = await runtimeFactory({ repositoryRoot: root, env: isolated.env, runner, historicalOverlay })
    try { assertVerifiedExactNpmRuntimeCapability(npmRuntime, expectedNpm) } catch (error) {
      invariant(false, error?.message || 'verified exact npm runtime factory returned an invalid capability', errorPrefix)
    }
    for (let index = 0; index < GOVERNANCE_DEPENDENCY_NPM_STEPS.length; index += 1) {
      const args = GOVERNANCE_DEPENDENCY_NPM_STEPS[index]
      if (index === 2) {
        auditReceipt = runVulnerabilityAuditUnderPolicy(vulnerabilityPolicy, () => runVerifiedHighVulnerabilityAudit(process.execPath, [npmRuntime.cli, ...args], {
          root,
          environment: isolated.env,
          runner,
          npmRuntime,
          installedOverlayReceipt,
          errorPrefix,
        }), { errorPrefix })
      } else {
        runClosedBootstrapStep(process.execPath, [npmRuntime.cli, ...args], { root, environment: isolated.env, runner, errorPrefix })
        if (index === 0) installedOverlayReceipt = npmRuntime.applyInstalledSecurityOverlay(root)
      }
      assertBootstrapAuthorityUnchanged(root, snapshot, { errorPrefix })
      assertClosedProjectNpmConfig(root, expectedNpmrcLines, { errorPrefix })
      await validateRoleRepository(root)
      await afterStage({ index, args: [...args], root })
    }
    return {
      root,
      toolchain: npmRuntime.toolchain,
      securityOverlay: installedOverlayReceipt,
      vulnerabilityAudit: auditReceipt,
      steps: ['verified-exact-npm-runtime', 'locked-install', 'signature-audit', 'vulnerability-audit'],
    }
  } finally {
    try { npmRuntime?.cleanup?.() } finally { isolated.cleanup() }
  }
}

// ── 差集式弱點稽核(2026-09-29 OE6 立於 install-candidate-dependencies.mjs;2026-09-30 搬來共用 lib,consumer 升級交易也用)────────────────────────────────────────────────
//
// 原本這裡對候選跑 enforce 稽核(exact-shape 認列;任何新 advisory 一律 fail closed)。那道判準的 owner 是 protected main
// 自己的 CI(lib/governance-dependency-bootstrap.mjs);放在 anchor 裡有一個結構性後果:anchor 執行的是 **base 的**腳本,
// base 不可能認得之後才登記的 advisory —— 上游 2026-09-28 對 npm 內建 ip-address / undici 發新通報那天,每個 PR 的 anchor 都紅,
// 連「把新形狀認列進 bootstrap」的修復 PR 也被 anchor 擋住(它的候選樹跟 main 一模一樣,只是 base 的 exact-shape 不認得)。
// anchor 要回答的問題只有一個:**候選相對 protected main 有沒有新增弱點**。所以改成兩棵樹各跑一次同樣的 `npm audit --json`
// (同一時刻、同一份 advisory 資料庫、同一個 verified npm),取差集:
//   · 候選有、base 沒有的(套件 × advisory)→ 擋(GOV-CANDIDATE-DEPS-002,逐筆點名 advisory URL);
//   · 兩邊都有的 → 繼承自 main,印出、進 receipt、不擋(main 的既有狀態由 main 自己的 CI 與 OE15 認列 / overlay 負責);
//   · base 有、候選沒有的 → 修好了,印出。
// **任一邊的稽核結果不是合格的報告(非 JSON / advisory 端點錯誤 / schema 不對 / 退出碼不是 0|1)→ 一律紅**:
// base 壞掉不得讀成「base 沒有弱點」(那會把候選的每一筆都判成新增),也不得讀成略過(M37)。
// 差集只用本檔(base 的腳本)算;候選程式碼一行都不執行(它只是被 audit 的資料)。
const DIFFERENTIAL_AUDIT_ARGS = Object.freeze(['audit', '--audit-level=high', '--json', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`])
export const DIFFERENTIAL_AUDIT_DEFAULT_PREFIX = 'GOV-CANDIDATE-DEPS-002'

/** 純函式:`npm audit --json`(auditReportVersion 2)→ Map<套件, {severity, range, advisories:Set<advisory URL 或 source>}>。 */
export function parseAuditFindings(stdout, label = 'candidate', prefix = DIFFERENTIAL_AUDIT_DEFAULT_PREFIX) {
  let report
  try { report = JSON.parse(String(stdout || '')) } catch {
    throw new Error(`${prefix}:${label} npm audit did not produce JSON`)
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error(`${prefix}:${label} npm audit did not produce a JSON object`)
  if (report.auditReportVersion === undefined) {
    // registry 的 advisory 服務掛掉時吐的是錯誤物件(parse 得過、沒有 auditReportVersion);訊息形狀對齊 bootstrap,
    // 讓 isTransientAdvisoryEndpointFailure 認得出「暫時性網路錯誤」而重試。
    const summary = typeof report.message === 'string'
      ? `advisory endpoint failed:${report.message.slice(0, 200)}`
      : `unrecognised audit payload(keys:${Object.keys(report).slice(0, 12).join(',') || '<none>'})`
    throw new Error(`${prefix}:${label} npm audit ${summary}`)
  }
  if (report.auditReportVersion !== 2 || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error(`${prefix}:${label} npm audit JSON schema is unsupported`)
  }
  const findings = new Map()
  for (const [name, finding] of Object.entries(report.vulnerabilities)) {
    if (!finding || typeof finding !== 'object' || finding.name !== name || !Array.isArray(finding.via)) {
      throw new Error(`${prefix}:${label} npm audit finding is malformed:${name}`)
    }
    const advisories = new Set()
    for (const via of finding.via) {
      if (typeof via === 'string') continue // 經由別的套件傳染:那個套件自己有一筆,advisory 記在它那裡
      if (!via || typeof via !== 'object' || (!Number.isInteger(via.source) && typeof via.url !== 'string')) {
        throw new Error(`${prefix}:${label} npm audit advisory is malformed:${name}`)
      }
      advisories.add(typeof via.url === 'string' && via.url ? via.url : `source:${via.source}`)
    }
    findings.set(name, { severity: String(finding.severity ?? 'unknown'), range: String(finding.range ?? ''), advisories })
  }
  return findings
}

/** 純函式:候選相對 base 的差集。只有 introduced 會擋。 */
export function diffAuditFindings(base, candidate) {
  const byName = (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  const introduced = []
  const inherited = []
  for (const [name, finding] of candidate) {
    const baseline = base.get(name)
    const advisories = [...finding.advisories].sort()
    if (!baseline) {
      introduced.push({ name, severity: finding.severity, range: finding.range, advisories, reason: 'package-not-vulnerable-in-base' })
      continue
    }
    const fresh = advisories.filter((advisory) => !baseline.advisories.has(advisory))
    if (fresh.length) introduced.push({ name, severity: finding.severity, range: finding.range, advisories: fresh, reason: 'new-advisory' })
    else inherited.push({ name, severity: finding.severity, range: finding.range, advisories })
  }
  const resolved = [...base.keys()].filter((name) => !candidate.has(name)).sort()
  return Object.freeze({ introduced: introduced.sort(byName), inherited: inherited.sort(byName), resolved })
}

export function runAuditFindingsJson(cli, root, {
  environment,
  runner = spawnSync,
  label,
  prefix = DIFFERENTIAL_AUDIT_DEFAULT_PREFIX,
  retryLimit = GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT,
  backoffMs = GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS,
  sleep = sleepSync,
  report = (line) => console.error(line),
} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const result = runner(process.execPath, [cli, ...DIFFERENTIAL_AUDIT_ARGS], {
      cwd: root,
      env: { ...environment, NPM_CONFIG_REGISTRY: GOVERNANCE_DEPENDENCY_REGISTRY, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_STRICT_SSL: 'true' },
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30 * 60 * 1_000,
      windowsHide: true,
    })
    if (result?.error) throw result.error
    if (!Number.isInteger(result?.status) || (result.status !== 0 && result.status !== 1)) {
      throw new Error(`${prefix}:${label} npm audit returned an invalid exit status:${String(result?.status)}`)
    }
    try {
      const findings = parseAuditFindings(result.stdout, label, prefix)
      return { findings, rawAuditSha256: createHash('sha256').update(Buffer.from(String(result.stdout || ''))).digest('hex') }
    } catch (error) {
      if (!isTransientAdvisoryEndpointFailure(error) || attempt >= retryLimit) throw error
      const wait = backoffMs * attempt
      report(`⚠️  ${prefix}:${label} npm audit advisory endpoint transient failure(attempt ${attempt}/${retryLimit}),retrying in ${wait}ms`)
      sleep(wait)
    }
  }
}

/**
 * 差集的裁決與報告(兩個呼叫端共用):inherited / resolved 只印不擋,introduced 逐筆點名後擋。
 * 呼叫端:DS 的 anchor 候選安裝(本檔 runDifferentialVulnerabilityAudit)與 consumer 升級交易的重建
 *(verify-upgrade-evidence.mjs reconstructExpectedUpgrade)。
 */
export function assertNoIntroducedAuditFindings(diff, {
  prefix = DIFFERENTIAL_AUDIT_DEFAULT_PREFIX,
  subject = 'candidate',
  baseLabel = 'protected main',
  report = (line) => console.error(line),
} = {}) {
  for (const item of diff.inherited) report(`·  繼承自 ${baseLabel}(不擋;owner 是 ${baseLabel} 自己的 CI / 安全更新):${item.name} ${item.severity} ${item.range} ← ${item.advisories.join(', ')}`)
  for (const name of diff.resolved) report(`·  ${subject} 已修掉:${name}`)
  if (diff.introduced.length) {
    const lines = diff.introduced.map((item) => `${item.name} ${item.severity} ${item.range}(${item.reason})← ${item.advisories.join(', ') || '(經由其他套件)'}`)
    throw new Error(`${prefix}:${subject} introduces ${diff.introduced.length} vulnerability finding(s) that ${baseLabel} does not have:\n  ${lines.join('\n  ')}`)
  }
}

export function runDifferentialVulnerabilityAudit({
  cli,
  trustedRoot,
  candidate,
  environment,
  runner = spawnSync,
  retryLimit = GOVERNANCE_AUDIT_TRANSIENT_RETRY_LIMIT,
  backoffMs = GOVERNANCE_AUDIT_TRANSIENT_BACKOFF_MS,
  sleep = sleepSync,
  report = (line) => console.error(line),
} = {}) {
  const common = { environment, runner, retryLimit, backoffMs, sleep, report }
  const base = runAuditFindingsJson(cli, trustedRoot, { ...common, label: 'protected-base' })
  const head = runAuditFindingsJson(cli, candidate, { ...common, label: 'candidate' })
  const diff = diffAuditFindings(base.findings, head.findings)
  assertNoIntroducedAuditFindings(diff, { report })
  return Object.freeze({
    schemaVersion: 1,
    kind: 'candidate-differential-vulnerability-audit-receipt',
    status: 'passed',
    policy: 'block-only-findings-introduced-relative-to-protected-base',
    base: Object.freeze({ root: trustedRoot, findings: base.findings.size, rawAuditSha256: base.rawAuditSha256 }),
    candidate: Object.freeze({ root: candidate, findings: head.findings.size, rawAuditSha256: head.rawAuditSha256 }),
    introduced: Object.freeze([]),
    inherited: Object.freeze(diff.inherited.map((item) => Object.freeze({ ...item, advisories: Object.freeze(item.advisories) }))),
    resolved: Object.freeze(diff.resolved),
  })
}
