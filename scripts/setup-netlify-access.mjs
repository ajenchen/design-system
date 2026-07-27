#!/usr/bin/env node

// Netlify onboarding is deliberately Dashboard-only while the reviewed CLI candidate is blocked.
// This executable is the enforcement SSOT copied into every published product template: it never
// downloads, installs, invokes, logs in through, or mutates state with Netlify CLI.

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ERROR_PREFIX = 'NETLIFY-MANUAL-SETUP-001'
const STORYBOOK_ACCESS_POLICY = 'fail-closed-v1'
const STORYBOOK_AUTH_MISCONFIGURED_STATUS = 503
const STORYBOOK_AUTH_REQUIRED_STATUS = 401
export const STORYBOOK_BASIC_AUTH_SOURCE_SHA256 = 'f01afcb94634c7a08c65d0e8a69990797c2d3b565bf225b37955cac53d778b68'
export const NETLIFY_MANUAL_REQUIRED_EXIT_CODE = 2

export const NETLIFY_CLI_INSTALLATION_BLOCKER = Object.freeze({
  schemaVersion: 1,
  code: 'NETLIFY-CLI-AUTO-INSTALL-BLOCKED-001',
  status: 'blocked',
  assessedPackage: 'netlify-cli@26.2.0',
  assessedAt: '2026-07-22',
  highSeverityFindings: 5,
  decision: 'dashboard-manual-only',
  setupComplete: false,
  reenableCriteria: Object.freeze([
    'reviewed exact version and immutable package lock',
    'canonical registry artifacts with integrity verification',
    'install scripts disabled plus signature verification',
    'zero high-severity audit findings',
    'direct regression tests and reviewed propagation',
  ]),
})

export const NETLIFY_DASHBOARD_URL = 'https://app.netlify.com/'
export const NETLIFY_OFFICIAL_GUIDES = Object.freeze({
  branchDeploys: 'https://docs.netlify.com/deploy/deploy-types/branch-deploys/',
  environmentVariables: 'https://docs.netlify.com/build/environment-variables/get-started/',
  importRepository: 'https://docs.netlify.com/start/quickstarts/deploy-from-repository/',
})

function invariant(condition, message) {
  if (!condition) throw new Error(`${ERROR_PREFIX}:${message}`)
}

function containedPath(root, path, label) {
  invariant(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\'), `${label} is invalid`)
  const absolute = resolve(root, path)
  const rel = relative(root, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the repository`)
  return absolute
}

function readOptionalRegularFile(root, path, label) {
  const absolute = containedPath(root, path, label)
  let info
  try {
    info = lstatSync(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `${label} must be one regular no-link file`)
  invariant(realpathSync(absolute) === absolute, `${label} must not traverse a symbolic-link alias`)
  return readFileSync(absolute, 'utf8')
}

function safeJson(text, label) {
  if (text === null) return null
  try {
    const value = JSON.parse(text)
    invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be one JSON object`)
    return value
  } catch (error) {
    if (String(error?.message || '').startsWith(`${ERROR_PREFIX}:`)) throw error
    throw new Error(`${ERROR_PREFIX}:${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function safeNetlifySiteName(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) ? value : ''
}

function safeNetlifyUrl(value, { dashboard = false } = {}) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return ''
    if (dashboard) return url.hostname === 'app.netlify.com' ? url.href.replace(/\/$/, '') : ''
    return url.hostname === 'netlify.app' || url.hostname.endsWith('.netlify.app') ? url.href.replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

function stripTomlComment(line) {
  let quote = ''
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quote === '"') {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quote = ''
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '#') return line.slice(0, index)
  }
  return line
}

function parseClosedTomlString(value) {
  if (/^'[^'\r\n]*'$/.test(value)) return value.slice(1, -1)
  if (!/^"(?:[^"\\\r\n]|\\["\\/bfnrt])*"$/.test(value)) return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function inspectNetlifyToml(source) {
  if (source === null) return Object.freeze({ buildPresent: false, edgeFunctionWired: false })
  let activeTable = null
  let lastEdgeDeclaration = null
  let buildPresent = false
  const edgeDeclarations = []
  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim()
    if (!line) continue
    const arrayHeader = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/)
    if (arrayHeader) {
      activeTable = arrayHeader[1] === 'edge_functions'
        ? { fields: new Map(), invalid: false }
        : null
      lastEdgeDeclaration = activeTable
      if (activeTable) edgeDeclarations.push(activeTable)
      continue
    }
    const tableHeader = line.match(/^\[([A-Za-z0-9_.-]+)\]$/)
    if (tableHeader) {
      buildPresent ||= tableHeader[1] === 'build'
      if (lastEdgeDeclaration && tableHeader[1].startsWith('edge_functions.')) {
        lastEdgeDeclaration.invalid = true
      }
      lastEdgeDeclaration = null
      activeTable = null
      continue
    }
    if (!activeTable) continue
    const assignment = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/)
    if (!assignment || activeTable.fields.has(assignment?.[1])) {
      activeTable.invalid = true
      continue
    }
    const value = parseClosedTomlString(assignment[2].trim())
    if (value === null) {
      activeTable.invalid = true
      continue
    }
    activeTable.fields.set(assignment[1], value)
  }
  const basicAuthDeclarations = edgeDeclarations.filter(declaration => declaration.fields.get('function') === 'basic-auth')
  const edgeFunctionWired = basicAuthDeclarations.length === 1
    && !basicAuthDeclarations[0].invalid
    && basicAuthDeclarations[0].fields.size === 2
    && basicAuthDeclarations[0].fields.get('path') === '/*'
  return Object.freeze({ buildPresent, edgeFunctionWired })
}

function inspectBasicAuthPolicy(source) {
  const present = source !== null
  const sourceSha256 = present ? createHash('sha256').update(source).digest('hex') : ''
  const failClosed = present && sourceSha256 === STORYBOOK_BASIC_AUTH_SOURCE_SHA256
  return Object.freeze({ failClosed, policyVersion: failClosed ? STORYBOOK_ACCESS_POLICY : '', present })
}

export function inspectNetlifyManualSetup(rootPath = ROOT) {
  const root = realpathSync(resolve(rootPath))
  invariant(lstatSync(root).isDirectory(), 'repository root must be one real directory')
  const packageJson = safeJson(readOptionalRegularFile(root, 'package.json', 'package.json'), 'package.json')
  const netlifyToml = readOptionalRegularFile(root, 'netlify.toml', 'netlify.toml')
  const edgeFunction = readOptionalRegularFile(root, 'netlify/edge-functions/basic-auth.ts', 'Basic Auth edge function')
  const state = safeJson(readOptionalRegularFile(root, '.netlify/state.json', 'legacy Netlify state'), 'legacy Netlify state')
  const metadata = safeJson(readOptionalRegularFile(root, '.netlify/deploy-meta.json', 'legacy Netlify metadata'), 'legacy Netlify metadata')
  const netlifyConfiguration = inspectNetlifyToml(netlifyToml)
  const siteName = safeNetlifySiteName(metadata?.siteName) || safeNetlifySiteName(state?.siteSlug)
  const siteUrl = safeNetlifyUrl(metadata?.siteUrl) || (siteName ? `https://${siteName}.netlify.app` : '')
  const projectUrl = safeNetlifyUrl(metadata?.adminUrl, { dashboard: true })
  const basicAuthPolicy = inspectBasicAuthPolicy(edgeFunction)

  const checks = Object.freeze({
    basicAuthEdgeFunctionPresent: basicAuthPolicy.present,
    basicAuthFailClosed: basicAuthPolicy.failClosed,
    edgeFunctionWired: netlifyConfiguration.edgeFunctionWired,
    netlifyConfigurationPresent: netlifyConfiguration.buildPresent,
    packageManifestPresent: packageJson !== null,
  })
  const issues = []
  if (!checks.packageManifestPresent) issues.push('package.json is missing')
  if (!checks.netlifyConfigurationPresent) issues.push('netlify.toml with [build] is missing')
  if (!checks.basicAuthEdgeFunctionPresent || !checks.edgeFunctionWired) {
    issues.push('Basic Auth edge function file and netlify.toml wiring are incomplete')
  }
  if (checks.basicAuthEdgeFunctionPresent && !checks.basicAuthFailClosed) {
    issues.push(`Basic Auth edge function does not implement ${STORYBOOK_ACCESS_POLICY}`)
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'netlify-manual-setup-diagnostic',
    status: 'manual-required',
    setupComplete: false,
    exitCode: NETLIFY_MANUAL_REQUIRED_EXIT_CODE,
    blocker: NETLIFY_CLI_INSTALLATION_BLOCKER,
    automatedCommandsExecuted: Object.freeze([]),
    checks,
    issues: Object.freeze(issues),
    accessControl: Object.freeze({
      policyVersion: basicAuthPolicy.policyVersion,
      misconfiguredStatus: STORYBOOK_AUTH_MISCONFIGURED_STATUS,
      unauthenticatedStatus: STORYBOOK_AUTH_REQUIRED_STATUS,
      credentialConfigurationVerified: false,
      liveReadbackVerified: false,
      sharingAllowed: false,
    }),
    repository: Object.freeze({ name: typeof packageJson?.name === 'string' ? packageJson.name : '', root }),
    discoveredSite: Object.freeze({ projectUrl, siteName, siteUrl }),
    dashboard: Object.freeze({ projectUrl: projectUrl || NETLIFY_DASHBOARD_URL, projects: NETLIFY_DASHBOARD_URL }),
    officialGuides: NETLIFY_OFFICIAL_GUIDES,
  })
}

export function renderNetlifyManualSetup(diagnostic) {
  const authReady = diagnostic.checks.edgeFunctionWired
    && diagnostic.checks.basicAuthEdgeFunctionPresent
    && diagnostic.checks.basicAuthFailClosed
  const lines = [
    `⛔ ${diagnostic.blocker.code}: Netlify CLI 自動安裝與執行已封鎖`,
    '',
    `已審查的 ${diagnostic.blocker.assessedPackage} lock audit 仍有 ${diagnostic.blocker.highSeverityFindings} 個 high-severity findings。`,
    '本指令不會下載、安裝、呼叫或登入 Netlify CLI，也不會寫入 repo 或 Netlify 狀態。',
    '以下 Dashboard 流程在地端、Codespaces 與其他 cloud agent 環境都相同：',
    '',
    `1. 開啟 ${diagnostic.dashboard.projects}`,
    '2. Add new project → Import an existing project → GitHub，授權後選擇目前 repo。',
    '3. 確認 Netlify 讀到 repo root 的 netlify.toml，再按 Publish。',
  ]
  if (authReady) {
    lines.push(
      '4. Project configuration → Environment variables → Add a variable：',
      '   Key: STORYBOOK_BASIC_AUTH',
      '   Value: user:password（帳號／密碼皆不可空白或含空格；帳密只存 Netlify，絕對不 commit）',
    )
  } else {
    lines.push('4. ⚠️ 本 checkout 未同時具備 Basic Auth edge function 與 netlify.toml wiring；不可宣稱站台已受密碼保護。')
  }
  lines.push(
    '5. Project configuration → Build & deploy → Continuous Deployment → Branches and deploy contexts → Branch deploys: All。',
    '6. Deploy 後必做 live readback：無 Authorization 的無痕請求必回 401 + WWW-Authenticate，正確帳密必能讀到 Storybook。',
    '   若回 503，代表 STORYBOOK_BASIC_AUTH 缺失或格式錯誤；修正並重新 deploy，絕對不可分享該站台。',
    '7. 只有上述匿名／正確帳密兩項 live readback 都通過，才可從 Dashboard 的 Deploys 分享真實 production/preview URL。',
    '',
    `Official import guide: ${diagnostic.officialGuides.importRepository}`,
    `Official environment-variable guide: ${diagnostic.officialGuides.environmentVariables}`,
    `Official branch-deploy guide: ${diagnostic.officialGuides.branchDeploys}`,
    '',
    '狀態：MANUAL ACTION REQUIRED（尚未驗證 Netlify 端 env 與 live readback，因此以 exit 2 fail-closed）',
  )
  if (diagnostic.discoveredSite.projectUrl || diagnostic.discoveredSite.siteUrl) {
    lines.push('', '唯讀找到的舊有本機 metadata（仍需 Dashboard 確認）：')
    if (diagnostic.discoveredSite.projectUrl) lines.push(`  Project: ${diagnostic.discoveredSite.projectUrl}`)
    if (diagnostic.discoveredSite.siteUrl) lines.push(`  Site: ${diagnostic.discoveredSite.siteUrl}`)
  }
  if (diagnostic.issues.length > 0) lines.push('', ...diagnostic.issues.map(issue => `⚠️ ${issue}`))
  return `${lines.join('\n')}\n`
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const args = process.argv.slice(2)
  const allowed = new Set(['--check', '--json', '--skip-prompts'])
  if (args.includes('--help')) {
    console.log('Usage: node scripts/setup-netlify-access.mjs [--check] [--json]')
    console.log('Prints the fail-closed Dashboard/manual setup diagnostic; it never installs or invokes Netlify CLI.')
  } else if (args.some(arg => !allowed.has(arg)) || new Set(args).size !== args.length) {
    console.error(`${ERROR_PREFIX}:unsupported or duplicate argument`)
    process.exitCode = 64
  } else {
    try {
      const diagnostic = inspectNetlifyManualSetup(process.cwd())
      if (args.includes('--json')) console.log(JSON.stringify(diagnostic, null, 2))
      else process.stdout.write(renderNetlifyManualSetup(diagnostic))
      process.exitCode = diagnostic.exitCode
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
