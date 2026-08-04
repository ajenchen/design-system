import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const CLAUDE_PERMISSION_POLICY_SOURCE = 'packages/design-system/ds-canonical/adapters/claude-settings-base.json'
export const CLAUDE_PERMISSION_POLICY_SCHEMA = 'scripts/schemas/claude-permission-policy.schema.json'

const ENGINEERING_DELEGATION_ALLOW = Object.freeze(['Edit'])
const HUMAN_INTERACTION_ASK_COMMANDS = Object.freeze([
  /^(?:claude (?:auth )?login|gh auth (?:login|refresh))(?:\s|\*|$)/,
  /^(?:npm (?:adduser|login)|npm access (?:grant|revoke|set)|npm org (?:set|rm)|npm owner (?:add|rm)|npm profile .*\b2fa\b)(?:\s|\*|$)/,
  /^(?:docker login|aws configure|aws sso login|gcloud auth|az login|netlify login|vercel login)(?:\s|\*|$)/,
])
const FAIL_CLOSED_DENY_COMMANDS = Object.freeze([
  /^gh auth token(?:\s|\*|$)/,
  /^gh (?:secret|variable) (?:set|delete)(?:\s|\*|$)/,
  /^git credential(?:\s|\*|$)/,
  /^npm token(?:\s|\*|$)/,
  /^ssh-add(?:\s|\*|$)/,
  /^git (?:reset|clean|branch -D|tag -d|commit --amend|checkout|restore)(?:\s|\*|$)/,
  /^git push (?:.*--force|-f)(?:\s|\*|$)/,
  /^gh (?:issue delete|release delete|repo delete|run delete)(?:\s|\*|$)/,
  /^gh api .*(?:--method DELETE|-X DELETE)/,
  /^npm (?:unpublish|deprecate)(?:\s|\*|$)/,
  /^(?:rm|find .* -delete|dd|mkfs|shred)(?:\s|\*|$)/,
  /(?:--dangerously-skip-permissions|--permission-mode bypassPermissions|--dangerously-bypass-approvals-and-sandbox)/,
])
const REQUIRED_DENY_CATEGORIES = Object.freeze([
  ['raw-github-token-extraction', /^gh auth token(?:\s|\*|$)/],
  ['raw-github-secret-mutation', /^gh secret (?:set|delete)(?:\s|\*|$)/],
  ['raw-github-variable-mutation', /^gh variable (?:set|delete)(?:\s|\*|$)/],
  ['raw-git-credential-access', /^git credential(?:\s|\*|$)/],
  ['raw-package-token-access', /^npm token(?:\s|\*|$)/],
  ['history-reset', /^git reset(?:\s|\*|$)/],
  ['package-unpublish', /^npm unpublish(?:\s|\*|$)/],
  ['raw-filesystem-destruction', /^(?:rm|find .* -delete|dd|mkfs|shred)(?:\s|\*|$)/],
  ['permission-bypass', /(?:--dangerously-skip-permissions|--permission-mode bypassPermissions|--dangerously-bypass-approvals-and-sandbox)/],
])
const REQUIRED_CREDENTIAL_READ_DENIES = Object.freeze([
  'Read(./.env)',
  'Read(./secrets/**)',
  'Read(~/.aws/**)',
  'Read(~/.config/gcloud/**)',
  'Read(~/.docker/**)',
  'Read(~/.git-credentials)',
  'Read(~/.kube/**)',
  'Read(~/.netrc)',
  'Read(~/.npmrc)',
  'Read(~/.ssh/**)',
])
const CREDENTIAL_READ_DENY = /^Read\((?:\.\/\.env(?:\.\*)?|\.\/secrets\/\*\*|~\/\.(?:aws|azure|config\/gcloud|config\/gh|docker|gnupg|kube|ssh)\/\*\*|~\/\.(?:git-credentials|netrc|npmrc|pypirc))\)$/
const REQUIRED_CREDENTIAL_FILE_PATHS = Object.freeze([
  './.env',
  './secrets/**',
  '~/.aws/credentials',
  // ~/.config/gh/hosts.yml 刻意可讀(owner 一次性授權 2026-07-30):它是 sandbox 唯一
  // 真的碰得到的憑證來源 —— SSH 過不了 proxy(nc: authentication method negotiation failed)、
  // macOS Keychain API 被擋(-67674),只剩 HTTPS + gh 憑證這條。owner 的 settings.local.json
  // 早已 allow Bash(gh auth:*) / Bash(git push *),移除此 deny 才讓那些授權不再是死條文。
  // 印出 token 仍禁(permissions.deny Bash(gh auth token*));~/.ssh/**、~/.git-credentials、
  // gh secret/variable 寫入、gh repo/release/run delete、force-push、reset 一律維持 deny。
  '~/.docker/config.json',
  '~/.git-credentials',
  '~/.kube/config',
  '~/.netrc',
  '~/.npmrc',
  '~/.ssh/**',
])
const REQUIRED_EXTERNAL_CREDENTIAL_ENV_VARS = Object.freeze([
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'SSH_AUTH_SOCK',
])
// Agent push 走 HTTPS,不走 SSH(2026-07-30 實測):sandbox 網路是 HTTP/HTTPS proxy,載不了
// port 22 —— SSH push 一律死在 "authentication method negotiation failed",跟憑證政策無關。
// 所以 SSH_AUTH_SOCK 維持 deny(開它會擴大憑證暴露卻證明換不到任何能力);宣告的推送通道
// 是上方 gh 憑證那條。

function bashRuleCommand(rule, label) {
  const match = typeof rule === 'string' ? rule.match(/^Bash\((.+)\)$/) : null
  if (!match) throw new Error(`${label} contains a non-Bash rule`)
  return match[1]
}

function contained(root, repositoryPath, label) {
  if (typeof repositoryPath !== 'string' || !repositoryPath || repositoryPath.includes('\\') || isAbsolute(repositoryPath)) {
    throw new Error(`${label} must be a repository-relative POSIX path`)
  }
  if (repositoryPath.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} contains an unsafe path segment`)
  }
  const base = resolve(root)
  const target = resolve(base, repositoryPath)
  const rel = relative(base, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes the repository root`)
  return target
}

function regularNoSymlink(root, repositoryPath, label) {
  const base = resolve(root)
  const target = contained(base, repositoryPath, label)
  let cursor = base
  for (const part of relative(base, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (!existsSync(cursor)) throw new Error(`${label} is missing:${repositoryPath}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) throw new Error(`${label} contains a symbolic link:${repositoryPath}`)
  }
  const info = lstatSync(target)
  if (!info.isFile() || info.nlink !== 1) throw new Error(`${label} must be a regular unaliased file:${repositoryPath}`)
  return target
}

function uniqueStringRules(value, label) {
  if (!Array.isArray(value) || value.some((rule) => typeof rule !== 'string' || !rule)) throw new Error(`${label} must contain non-empty strings`)
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicate rules`)
  return [...value]
}

function exactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an open or incomplete shape`)
  }
  return value
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertSortedUniqueCredentialRecords(records, key, label) {
  if (!Array.isArray(records) || records.length === 0) throw new Error(`${label} must be a non-empty array`)
  const identities = records.map((record, index) => {
    exactObjectKeys(record, [key, 'mode'], `${label}[${index}]`)
    if (typeof record[key] !== 'string' || !record[key] || record.mode !== 'deny') {
      throw new Error(`${label}[${index}] must be an exact deny record`)
    }
    return record[key]
  })
  if (new Set(identities).size !== identities.length || JSON.stringify(identities) !== JSON.stringify([...identities].sort())) {
    throw new Error(`${label} must be sorted and unique`)
  }
  return identities
}

export function readClaudePermissionPolicy({ sourceRoot = DEFAULT_ROOT } = {}) {
  const sourcePath = regularNoSymlink(sourceRoot, CLAUDE_PERMISSION_POLICY_SOURCE, 'Claude permission-policy SSOT')
  const schemaPath = regularNoSymlink(sourceRoot, CLAUDE_PERMISSION_POLICY_SCHEMA, 'Claude permission-policy schema')
  const bytes = readFileSync(sourcePath)
  const document = JSON.parse(bytes.toString('utf8'))
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  if (!validate(document)) {
    throw new Error(`Claude permission-policy SSOT violates its closed schema:${(validate.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')}`)
  }
  const allow = uniqueStringRules(document.permissions.allow, 'Claude DS adapter permissions.allow')
  const ask = uniqueStringRules(document.permissions.ask, 'Claude permission-policy permissions.ask')
  const deny = uniqueStringRules(document.permissions.deny, 'Claude permission-policy permissions.deny')
  if (ENGINEERING_DELEGATION_ALLOW.some((rule, index) => allow[index] !== rule)
    || allow.some((rule) => (
      !ENGINEERING_DELEGATION_ALLOW.includes(rule) && !/^Skill\([a-z0-9-]+\)$/.test(rule)
    ))) {
    throw new Error('Claude DS adapter permissions.allow must expose only the canonical engineering delegation and registered skills')
  }
  const askCommands = ask.map((rule) => bashRuleCommand(rule, 'Claude permission-policy permissions.ask'))
  if (askCommands.some((command) => !HUMAN_INTERACTION_ASK_COMMANDS.some((pattern) => pattern.test(command)))) {
    throw new Error('Claude permission-policy permissions.ask must be limited to login, MFA/OAuth/2FA, credential-reference, billing, or platform-owner interaction')
  }
  const denyCommands = deny
    .filter(rule => rule.startsWith('Bash('))
    .map(rule => bashRuleCommand(rule, 'Claude permission-policy permissions.deny'))
  const credentialReadDenies = deny.filter(rule => rule.startsWith('Read('))
  if (deny.length !== denyCommands.length + credentialReadDenies.length
    || credentialReadDenies.some(rule => !CREDENTIAL_READ_DENY.test(rule))) {
    throw new Error('Claude permission-policy permissions.deny contains an unsupported non-Bash or credential-read rule')
  }
  if (denyCommands.some((command) => !FAIL_CLOSED_DENY_COMMANDS.some((pattern) => pattern.test(command)))) {
    throw new Error('Claude permission-policy permissions.deny may contain only raw destructive, history-rewrite, unpublish, or bypass commands')
  }
  for (const [category, pattern] of REQUIRED_DENY_CATEGORIES) {
    if (!denyCommands.some((command) => pattern.test(command))) {
      throw new Error(`Claude permission-policy permissions.deny omits mandatory fail-closed category:${category}`)
    }
  }
  for (const rule of REQUIRED_CREDENTIAL_READ_DENIES) {
    if (!credentialReadDenies.includes(rule)) {
      throw new Error(`Claude permission-policy permissions.deny omits mandatory credential-read protection:${rule}`)
    }
  }
  const sandbox = document.sandbox
  if (
    sandbox.enabled !== true
    || sandbox.failIfUnavailable !== true
    || sandbox.autoAllowBashIfSandboxed !== true
    || sandbox.allowUnsandboxedCommands !== false
    // enableWeakerNestedSandbox must stay true: it is the only documented way for the Linux
    // bubblewrap sandbox to start inside an already-containerized host (Claude Code cloud runs an
    // Ubuntu container, where bwrap cannot mount a fresh /proc and must bind-mount the container's
    // existing one). It is inert on macOS, which sandboxes through Seatbelt rather than bubblewrap.
    // Forcing it false does not harden anything; it only makes `failIfUnavailable` abort every
    // containerized session before the first tool call, which is how cloud sessions regressed.
    || sandbox.enableWeakerNestedSandbox !== true
    || sandbox.enableWeakerNetworkIsolation !== false
    || sandbox.allowAppleEvents !== false
    || sandbox.excludedCommands.length !== 0
    || sandbox.network.allowedDomains.length !== 0
    || sandbox.network.deniedDomains.length !== 0
    || sandbox.network.allowUnixSockets.length !== 0
    || sandbox.network.allowAllUnixSockets !== false
    || sandbox.network.allowLocalBinding !== true
    || sandbox.network.allowMachLookup.length !== 0
  ) {
    throw new Error('Claude permission-policy sandbox must be fail-closed, network-closed, non-bypassable, and exclude no commands')
  }
  const credentialFiles = assertSortedUniqueCredentialRecords(
    sandbox.credentials.files,
    'path',
    'Claude permission-policy sandbox.credentials.files',
  )
  const credentialEnvVars = assertSortedUniqueCredentialRecords(
    sandbox.credentials.envVars,
    'name',
    'Claude permission-policy sandbox.credentials.envVars',
  )
  if (sandbox.credentials.allowPlaintextInject !== false) {
    throw new Error('Claude permission-policy sandbox must forbid plaintext credential injection')
  }
  for (const path of REQUIRED_CREDENTIAL_FILE_PATHS) {
    if (!credentialFiles.includes(path)) throw new Error(`Claude permission-policy sandbox omits credential-file protection:${path}`)
  }
  for (const name of REQUIRED_EXTERNAL_CREDENTIAL_ENV_VARS) {
    if (!credentialEnvVars.includes(name)) throw new Error(`Claude permission-policy sandbox omits credential-environment protection:${name}`)
  }
  if (allow.some((rule) => ask.includes(rule) || deny.includes(rule))
    || ask.some((rule) => deny.includes(rule))) {
    throw new Error('Claude permission-policy duplicates a rule across allow, ask, and deny')
  }
  const delegatedAllow = allow.filter((rule) => ENGINEERING_DELEGATION_ALLOW.includes(rule))
  return Object.freeze({
    source: CLAUDE_PERMISSION_POLICY_SOURCE,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    dsAllow: Object.freeze(allow),
    dsDefaultMode: document.permissions.defaultMode,
    sandbox: Object.freeze(cloneJson(sandbox)),
    permissions: Object.freeze({
      delegatedAllow: Object.freeze(delegatedAllow),
      ask: Object.freeze(ask),
      deny: Object.freeze(deny),
      disableBypassPermissionsMode: 'disable',
    }),
  })
}

export function materializeClaudePermissions(profile, policy, { label = 'Claude permission profile' } = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${label} must be an object`)
  const allowedKeys = new Set(['allow', 'deny', 'defaultMode'])
  for (const key of Object.keys(profile)) {
    if (!allowedKeys.has(key)) throw new Error(`${label}.${key} is policy-owned or unsupported; derive it from ${CLAUDE_PERMISSION_POLICY_SOURCE}`)
  }
  const profileAllow = uniqueStringRules(profile.allow || [], `${label}.allow`)
  const profileDeny = profile.deny === undefined ? [] : uniqueStringRules(profile.deny, `${label}.deny`)
  if (!['default', 'acceptEdits', 'plan', 'dontAsk'].includes(profile.defaultMode)) throw new Error(`${label}.defaultMode is missing or unsafe`)
  if (profileAllow.some((rule) => /^Bash(?:\(|$)/.test(rule) || rule === 'Edit')) {
    throw new Error(`${label}.allow cannot redefine the canonical engineering delegation`)
  }
  if (profileAllow.some((rule) => policy.permissions.ask.includes(rule) || policy.permissions.deny.includes(rule))) {
    throw new Error(`${label}.allow conflicts with the canonical human-interaction or fail-closed policy`)
  }
  if (profileDeny.some((rule) => policy.permissions.deny.includes(rule))) {
    throw new Error(`${label}.deny copies a policy-owned fail-closed rule`)
  }
  const allow = [...policy.permissions.delegatedAllow, ...profileAllow]
  const deny = [...policy.permissions.deny, ...profileDeny]
  if (deny.some((rule) => allow.includes(rule))) throw new Error(`${label} duplicates a rule across allow and deny`)
  return {
    allow,
    deny,
    defaultMode: policy.dsDefaultMode,
    ask: [...policy.permissions.ask],
    disableBypassPermissionsMode: policy.permissions.disableBypassPermissionsMode,
  }
}

export function materializeClaudeSandbox(profile, policy, {
  label = 'Claude sandbox profile',
  managedSettings = false,
} = {}) {
  if (profile === undefined) profile = {}
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${label} must be an object`)
  exactObjectKeys(profile, Object.hasOwn(profile, 'network') ? ['network'] : [], label)
  const output = cloneJson(policy.sandbox)
  if (Object.hasOwn(profile, 'network')) {
    exactObjectKeys(profile.network, ['allowManagedDomainsOnly'], `${label}.network`)
    if (profile.network.allowManagedDomainsOnly !== true || managedSettings !== true) {
      throw new Error(`${label}.network.allowManagedDomainsOnly is a managed-settings-only restrictive extension`)
    }
    output.network.allowManagedDomainsOnly = true
  } else if (managedSettings === true) {
    throw new Error(`${label} must enable managed-only network-domain authority`)
  }
  return output
}

export function materializeClaudeGovernanceSettings(profile, policy, {
  label = 'Claude governance profile',
  managedSettings = false,
} = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${label} must be an object`)
  exactObjectKeys(profile, Object.hasOwn(profile, 'sandbox') ? ['permissions', 'sandbox'] : ['permissions'], label)
  return {
    permissions: materializeClaudePermissions(profile.permissions, policy, { label: `${label}.permissions` }),
    sandbox: materializeClaudeSandbox(profile.sandbox, policy, {
      label: `${label}.sandbox`,
      managedSettings,
    }),
  }
}

export function assertClaudePermissionMaterialization(value, policy, {
  label = 'Claude materialized settings',
  managedSettings = false,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const permissions = value.permissions
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) throw new Error(`${label}.permissions must be an object`)
  if (Object.hasOwn(value, 'defaultMode') || Object.hasOwn(value, 'disableAutoMode') || Object.hasOwn(permissions, 'disableAutoMode')) throw new Error(`${label} uses obsolete or retired Claude permission keys`)
  if (JSON.stringify(permissions.ask) !== JSON.stringify(policy.permissions.ask)) throw new Error(`${label}.permissions.ask differs from the canonical privileged ask policy`)
  const deny = uniqueStringRules(permissions.deny, `${label}.permissions.deny`)
  if (policy.permissions.deny.some((rule, index) => deny[index] !== rule)) throw new Error(`${label}.permissions.deny omits or reorders the canonical fail-closed policy`)
  if (permissions.disableBypassPermissionsMode !== policy.permissions.disableBypassPermissionsMode) throw new Error(`${label} permits bypassPermissions`)
  if (permissions.defaultMode !== policy.dsDefaultMode) throw new Error(`${label}.permissions.defaultMode differs from the canonical engineering delegation`)
  const allow = uniqueStringRules(permissions.allow, `${label}.permissions.allow`)
  if (policy.permissions.delegatedAllow.some((rule) => !allow.includes(rule))
    || allow.some((rule) => (
      (/^Bash(?:\(|$)/.test(rule) || rule === 'Edit')
      && !policy.permissions.delegatedAllow.includes(rule)
    ))) {
    throw new Error(`${label}.permissions.allow differs from the canonical engineering delegation`)
  }
  if (allow.some((rule) => permissions.ask.includes(rule) || deny.includes(rule))) throw new Error(`${label}.permissions.allow conflicts with canonical ask or deny`)
  const expectedSandbox = materializeClaudeSandbox(
    managedSettings ? { network: { allowManagedDomainsOnly: true } } : {},
    policy,
    { label: `${label}.sandbox`, managedSettings },
  )
  if (JSON.stringify(value.sandbox) !== JSON.stringify(expectedSandbox)) {
    throw new Error(`${label}.sandbox differs from the canonical fail-closed sandbox`)
  }
  return true
}

export const assertClaudeGovernanceSettingsMaterialization = assertClaudePermissionMaterialization
