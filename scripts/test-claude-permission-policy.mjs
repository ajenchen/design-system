#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { buildProviderHookView } from './gen-codex-adapter.mjs'
import { mergeProviderHookSettings, validateCanonicalSettingsWiring } from './refresh-fork-launchers.mjs'
import {
  CLAUDE_PERMISSION_POLICY_SOURCE,
  assertClaudePermissionMaterialization,
  materializeClaudeGovernanceSettings,
  materializeClaudePermissions,
  materializeClaudeSandbox,
  readClaudePermissionPolicy,
} from './lib/claude-permission-policy.mjs'
import {
  validateActivePlanningDocumentContent,
  validatePlanningDocumentAuthority,
} from './validate-planning-registry.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'))

const base = readJson(CLAUDE_PERMISSION_POLICY_SOURCE)
const baseSchema = readJson('scripts/schemas/claude-permission-policy.schema.json')
const wiring = readJson('packages/design-system/ds-canonical/templates/product-provider-wiring.json')
const wiringSchema = readJson('packages/design-system/ds-canonical/templates/product-provider-wiring.schema.json')
const managedProfile = readJson('infra/governance/managed-host/templates/claude-managed-settings.json')
const policy = readClaudePermissionPolicy({ sourceRoot: root })

assert.doesNotThrow(() => validatePlanningDocumentAuthority({
  path: 'governance/planning/product-decision.md',
  status: 'awaiting-approval',
  executable: false,
  reason: 'Genuine product/UI/UX SSOT P2H: unresolved visible interaction semantics.',
}))
assert.throws(() => validatePlanningDocumentAuthority({
  path: 'governance/planning/engineering-plan.md',
  status: 'awaiting-approval',
  executable: false,
  reason: 'Wait for user approval before applying the engineering migration.',
}), /awaiting-approval is reserved for a genuine product\/UI\/UX SSOT P2H decision/)

const activePlan = {
  path: 'governance/planning/active-engineering-plan.md',
  status: 'active',
  executable: true,
  reason: 'Active engineering plan.',
}
assert.doesNotThrow(() => validateActivePlanningDocumentContent(activePlan, `
P2H product/UI/UX SSOT: visual baseline apply awaits a user decision on the visible result.
Before release publish, the account-holder must complete npm login and MFA.
After hard gates pass, the agent merges automatically and does not wait for user approval.
Agent 自動 commit／push／更新 PR／merge，不另等 user trigger。
Validator 機械禁止把 commit／push／PR／merge／release／rollout 綁回 user／owner approval。
`))
assert.doesNotThrow(() => validateActivePlanningDocumentContent({
  ...activePlan,
  status: 'reference',
  executable: false,
}, '由 owner 決定 commit/push/PR merge。'))
for (const prohibitedEngineeringCheckpoint of [
  '由 owner 決定 commit/push/PR merge。',
  'Release dispatch waits for user approval.',
  'External writes require human confirmation.',
  'Apply and rollout need owner sign-off.',
  '- commit/push/merge\n  - 等 user 拍板',
]) {
  assert.throws(
    () => validateActivePlanningDocumentContent(activePlan, prohibitedEngineeringCheckpoint),
    /active engineering operation must not depend on a human approval checkpoint/,
  )
}

assert.deepEqual(base.permissions.allow, policy.dsAllow)
assert.deepEqual(policy.permissions.delegatedAllow, ['Edit'])
assert.equal(policy.dsDefaultMode, 'acceptEdits')
assert.equal(base.permissions.allow.includes('Bash'), false, 'bare Bash remains auto-allowed outside the sandbox boundary')
for (const ordinaryEngineeringRule of [
  'Bash(git push *)',
  'Bash(gh pr create *)',
  'Bash(gh pr merge *)',
  'Bash(npm install *)',
  'Bash(npm ci *)',
  'Bash(npm publish *)',
  'Bash(npx *)',
  'Bash(curl *)',
]) {
  assert.equal(policy.permissions.ask.includes(ordinaryEngineeringRule), false, `${ordinaryEngineeringRule} remains a blanket human prompt`)
  assert.equal(policy.permissions.deny.includes(ordinaryEngineeringRule), false, `${ordinaryEngineeringRule} was converted from a prompt into a blanket denial`)
}
for (const failClosedRule of [
  'Bash(gh auth token*)',
  'Bash(gh secret set*)',
  'Bash(gh variable set*)',
  'Bash(git credential *)',
  'Bash(npm token *)',
  'Bash(git reset *)',
  'Bash(npm unpublish *)',
  'Bash(rm *)',
  'Bash(*--dangerously-skip-permissions*)',
  'Read(./.env)',
  'Read(~/.npmrc)',
  'Read(~/.ssh/**)',
]) assert.ok(policy.permissions.deny.includes(failClosedRule), `${failClosedRule} is not fail closed`)
for (const humanOnlyRule of [
  'Bash(claude auth login*)',
  'Bash(gh auth login*)',
  'Bash(npm login*)',
  'Bash(npm profile *2fa*)',
]) assert.ok(policy.permissions.ask.includes(humanOnlyRule), `${humanOnlyRule} is not reserved for platform interaction`)
for (const rawCredentialOrEngineeringMutation of [
  'Bash(gh auth token*)',
  'Bash(gh secret set*)',
  'Bash(gh secret delete*)',
  'Bash(gh variable set*)',
  'Bash(gh variable delete*)',
  'Bash(git credential *)',
  'Bash(npm token *)',
]) assert.equal(policy.permissions.ask.includes(rawCredentialOrEngineeringMutation), false, `${rawCredentialOrEngineeringMutation} remains a human engineering-decision prompt`)
assert.deepEqual(base.sandbox, policy.sandbox)
assert.deepEqual(base.sandbox.network.allowedDomains, [])
assert.equal(base.sandbox.enabled, true)
// Repo-portable tiers must never carry the hard gate: this policy travels to fresh-container
// cloud hosts where the Linux sandbox dependencies are absent and `failIfUnavailable: true`
// blocks Claude Code from starting (2026-08-18 incident). The managed tier re-hardens it.
assert.equal(base.sandbox.failIfUnavailable, false)
assert.equal(base.sandbox.autoAllowBashIfSandboxed, true)
assert.equal(base.sandbox.allowUnsandboxedCommands, false)
assert.equal(base.sandbox.network.allowAllUnixSockets, false)
// Nested-sandbox support is required, not optional: without it the Linux bubblewrap sandbox cannot
// start inside a containerized host and `failIfUnavailable` aborts the session. Inert on macOS.
assert.equal(base.sandbox.enableWeakerNestedSandbox, true)
assert.equal(base.sandbox.enableWeakerNetworkIsolation, false)
assert.equal(base.sandbox.allowAppleEvents, false)
assert.deepEqual(base.sandbox.excludedCommands, [])
assert.equal(base.sandbox.network.allowLocalBinding, true, 'loopback binding must stay permitted for the browser/Storybook verification contract')
assert.deepEqual(base.sandbox.network.allowedDomains, [], 'outbound network must stay closed')
assert.deepEqual(
  base.sandbox.credentials.envVars.find((entry) => entry.name === 'SSH_AUTH_SOCK'),
  { name: 'SSH_AUTH_SOCK', mode: 'deny' },
  'SSH_AUTH_SOCK must stay denied; agent push uses the governed HTTPS credential path instead',
)
for (const rule of ['Bash(git push *--force*)', 'Bash(git push -f *)', 'Bash(git reset *)', 'Bash(gh auth token*)']) {
  assert.ok(base.permissions.deny.includes(rule), `destructive/credential rule must stay denied:${rule}`)
}
for (const path of ['~/.ssh/**', '~/.git-credentials']) {
  assert.ok(base.sandbox.credentials.files.some((entry) => entry.path === path && entry.mode === 'deny'), `key material must stay denied:${path}`)
}
for (const name of ['ANTHROPIC_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) {
  assert.deepEqual(
    base.sandbox.credentials.envVars.find(record => record.name === name),
    { name, mode: 'deny' },
    `${name} is exposed to sandboxed Bash`,
  )
}
assertClaudePermissionMaterialization(base, policy, { label: 'DS Claude adapter settings' })

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateBase = ajv.compile(baseSchema)
assert.equal(validateBase(base), true, ajv.errorsText(validateBase.errors))
const misplacedBase = structuredClone(base)
misplacedBase.permissions.disableAutoMode = 'disable'
assert.equal(validateBase(misplacedBase), false, 'base schema accepted the retired permissions.disableAutoMode flag')
const residualTopLevelBase = structuredClone(base)
residualTopLevelBase.disableAutoMode = 'disable'
assert.equal(validateBase(residualTopLevelBase), false, 'base schema accepted the retired top-level disableAutoMode flag')
const topLevelDefaultBase = structuredClone(base)
delete topLevelDefaultBase.permissions.defaultMode
topLevelDefaultBase.defaultMode = 'acceptEdits'
assert.equal(validateBase(topLevelDefaultBase), false, 'base schema accepted top-level defaultMode instead of permissions.defaultMode')
const missingDenyBase = structuredClone(base)
delete missingDenyBase.permissions.deny
assert.equal(validateBase(missingDenyBase), false, 'base schema accepted omission of fail-closed deny rules')

const semanticFixture = realpathSync(mkdtempSync(join(tmpdir(), 'claude-permission-policy-semantics-')))
try {
  const sourcePath = join(semanticFixture, CLAUDE_PERMISSION_POLICY_SOURCE)
  const schemaPath = join(semanticFixture, 'scripts/schemas/claude-permission-policy.schema.json')
  mkdirSync(dirname(sourcePath), { recursive: true })
  mkdirSync(dirname(schemaPath), { recursive: true })
  writeFileSync(schemaPath, `${JSON.stringify(baseSchema)}\n`)
  const assertSemanticPoison = (mutate, pattern) => {
    const poisoned = structuredClone(base)
    mutate(poisoned)
    writeFileSync(sourcePath, `${JSON.stringify(poisoned)}\n`)
    assert.throws(() => readClaudePermissionPolicy({ sourceRoot: semanticFixture }), pattern)
  }
  assertSemanticPoison(
    value => value.permissions.ask.push('Bash(git push *)'),
    /ask must be limited to login, MFA\/OAuth\/2FA, credential-reference, billing, or platform-owner/,
  )
  assertSemanticPoison(
    value => { value.permissions.deny = value.permissions.deny.filter(rule => rule !== 'Bash(git reset *)') },
    /omits mandatory fail-closed category:history-reset/,
  )
  assertSemanticPoison(
    value => value.permissions.deny.push('Bash(npm install *)'),
    /deny may contain only raw destructive/,
  )
  assertSemanticPoison(
    value => { value.permissions.allow[0] = 'Bash(*)' },
    /allow must expose only the canonical engineering delegation/,
  )
  for (const [mutate, pattern] of [
    [value => { value.sandbox.enabled = false }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.failIfUnavailable = true }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.autoAllowBashIfSandboxed = false }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.allowUnsandboxedCommands = true }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.network.allowedDomains = ['github.com'] }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.network.allowAllUnixSockets = true }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.enableWeakerNestedSandbox = false }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.enableWeakerNetworkIsolation = true }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.allowAppleEvents = true }, /closed schema|sandbox must be fail-closed/],
    [value => { value.sandbox.excludedCommands = ['git'] }, /closed schema|sandbox must be fail-closed/],
    [
      value => {
        value.sandbox.credentials.envVars = value.sandbox.credentials.envVars.filter(record => record.name !== 'GH_TOKEN')
      },
      /omits credential-environment protection:GH_TOKEN/,
    ],
    [
      value => {
        value.sandbox.credentials.files = value.sandbox.credentials.files.filter(record => record.path !== '~\/.npmrc')
      },
      /omits credential-file protection:~\/.npmrc/,
    ],
  ]) assertSemanticPoison(mutate, pattern)
} finally {
  rmSync(semanticFixture, { recursive: true, force: true })
}

const validateWiring = ajv.compile(wiringSchema)
assert.equal(validateWiring(wiring), true, ajv.errorsText(validateWiring.errors))
assert.equal(
  wiring.schemaVersion,
  wiringSchema.properties.schemaVersion.const,
  'product provider wiring version must be owned by its canonical schema',
)
assert.equal(Object.hasOwn(wiring.settings, 'defaultMode'), false)
assert.equal(wiring.settings.permissions.defaultMode, 'default')
assert.equal(wiring.settings.permissionPolicy, CLAUDE_PERMISSION_POLICY_SOURCE)
assert.deepEqual(Object.keys(wiring.settings.permissions).sort(), ['allow', 'defaultMode'], 'product profile must not copy policy-owned ask/disable controls')
assert.deepEqual(Object.keys(wiring.hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
const missingStopWiring = structuredClone(wiring)
delete missingStopWiring.hooks.Stop
assert.equal(validateWiring(missingStopWiring), false, 'product wiring schema accepted silent removal of the canonical Stop event')

const copiedWiring = structuredClone(wiring)
copiedWiring.settings.permissions.ask = [...policy.permissions.ask]
assert.equal(validateWiring(copiedWiring), false, 'closed product schema accepted a copied ask list')
assert.throws(
  () => materializeClaudePermissions(copiedWiring.settings.permissions, policy, { label: 'poisoned product profile' }),
  /policy-owned or unsupported/,
)

assert.equal(managedProfile.permissionPolicy, CLAUDE_PERMISSION_POLICY_SOURCE)
assert.deepEqual(Object.keys(managedProfile.permissions).sort(), ['allow', 'defaultMode', 'deny'], 'managed-host profile must not copy policy-owned ask/disable controls')
assert.equal(Object.hasOwn(managedProfile, 'disableAutoMode'), false, 'managed-host profile retains a misplaced copied disable flag')
assert.deepEqual(managedProfile.sandbox, { network: { allowManagedDomainsOnly: true } })
const managedGovernance = materializeClaudeGovernanceSettings({
  permissions: managedProfile.permissions,
  sandbox: managedProfile.sandbox,
}, policy, {
  label: 'managed-host profile',
  managedSettings: true,
})
const managedPermissions = managedGovernance.permissions
const managedSettings = {
  ...managedProfile,
  permissions: managedPermissions,
  sandbox: managedGovernance.sandbox,
}
delete managedSettings.permissionPolicy
assertClaudePermissionMaterialization(managedSettings, policy, {
  label: 'managed-host materialized settings',
  managedSettings: true,
})
assert.deepEqual(managedPermissions.allow, ['Edit'])
assert.equal(managedSettings.sandbox.network.allowManagedDomainsOnly, true)
assert.equal(managedPermissions.defaultMode, 'acceptEdits')
assert.deepEqual(
  managedPermissions.deny,
  policy.permissions.deny,
)
assert.throws(
  () => materializeClaudePermissions({
    ...managedProfile.permissions,
    allow: ['Bash(npm install *)'],
  }, policy, { label: 'provider-owned Bash override' }),
  /cannot redefine the canonical engineering delegation/,
)
assert.throws(
  () => materializeClaudeSandbox(
    { network: { allowManagedDomainsOnly: true } },
    policy,
    { label: 'project-owned managed-domain override' },
  ),
  /managed-settings-only restrictive extension/,
)

const repositoryAdapter = buildProviderHookView({ providerId: 'claude' }).config
assertClaudePermissionMaterialization(repositoryAdapter, policy, { label: 'repository Claude adapter' })
assert.deepEqual(repositoryAdapter.permissions.allow, policy.dsAllow)
assert.deepEqual(repositoryAdapter.sandbox, policy.sandbox)

// The DS repository's committed `.claude/settings.json` is classified `non-authority-exclusion`
// (protected-root-classification `claude-local-state`), so no generator ever rewrites it — the
// same standing as the template settings covered by test-fork-governance 5c-bis. It still travels
// with the repository into fresh-container cloud hosts, so its sandbox block must stay in exact
// parity with the policy source; without this assertion it kept shipping the cloud-fatal
// `failIfUnavailable: true` after the policy flipped (2026-08-18 incident).
{
  const committedRepoSettings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'))
  assert.deepEqual(
    committedRepoSettings.sandbox,
    policy.sandbox,
    'committed .claude/settings.json sandbox drifted from the canonical permission-policy sandbox',
  )
}

{
  const productGovernance = materializeClaudeGovernanceSettings({
    permissions: wiring.settings.permissions,
  }, policy, {
    label: 'product provider wiring governance profile',
  })
  const productAdapter = {
    permissions: productGovernance.permissions,
    sandbox: productGovernance.sandbox,
    // F6 fail-closed:canonical hook map 必須非空(空 map 視同看不懂的世代,merge 會 throw)。
    // 本 fixture 聚焦 permission 語意,故給最小合法 canonical 註冊。
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/governance/bin/inject_fork_governance_preamble.sh"' }] }] },
  }
  const manifest = readJson('packages/design-system/ds-canonical/fork/manifest.json')
  const refreshPolicy = readJson('packages/design-system/ds-canonical/fork/launchers/settings-hooks.json')
  refreshPolicy.surfaces.claude.permissionPolicy.sha256 = policy.sha256
  for (const [label, settings] of [['product Claude adapter', productAdapter]]) {
    assertClaudePermissionMaterialization(settings, policy, { label })
    assert.deepEqual(settings.permissions.allow, ['Edit'], `${label} did not inherit the provider-neutral engineering delegation`)
    assert.deepEqual(settings.permissions.deny, policy.permissions.deny, `${label} did not inherit fail-closed destructive controls`)
    assert.equal(Object.hasOwn(settings, 'defaultMode'), false, `${label} emitted obsolete top-level defaultMode`)
    assert.equal(Object.hasOwn(settings.permissions, 'disableAutoMode'), false, `${label} emitted obsolete permissions.disableAutoMode`)
    assert.equal(Object.hasOwn(settings, 'disableAutoMode'), false, `${label} emitted the retired disableAutoMode flag`)
    assert.equal(settings.permissions.defaultMode, 'acceptEdits')
    assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable')
  }
  const validatedRefreshPolicy = validateCanonicalSettingsWiring(refreshPolicy, manifest)
  assert.equal(validatedRefreshPolicy.kind, 'provider-hook-merge-policies')
  assert.equal(validatedRefreshPolicy.surfaces.claude.permissionPolicy.source, policy.source)
  assert.equal(validatedRefreshPolicy.surfaces.claude.permissionPolicy.sha256, policy.sha256)
  const poisonedRefreshPolicy = structuredClone(refreshPolicy)
  poisonedRefreshPolicy.surfaces.claude.permissionPolicy.source = 'infra/provider-owned-copy.json'
  assert.throws(() => validateCanonicalSettingsWiring(poisonedRefreshPolicy, manifest), /permission policy binding is invalid/)
  const privilegedRule = productAdapter.permissions.ask[0]
  const destructiveRule = productAdapter.permissions.deny[0]
  const overlapMerged = mergeProviderHookSettings({
    settings: {
      permissions: {
        allow: [privilegedRule, destructiveRule],
        ask: [
          privilegedRule,
          'Bash(git push *)',
          'Bash(npm publish *)',
          'Bash(my-consumer-owned-sensitive-tool *)',
        ],
      },
      sandbox: { enabled: false, allowAppleEvents: true },
      hooks: {},
    },
    canonicalConfig: productAdapter,
    policy: validatedRefreshPolicy.surfaces.claude,
    label: 'overlapping consumer permission fixture',
  })
  assert.equal(overlapMerged.settings.permissions.allow.includes(privilegedRule), false, 'canonical ask must outrank a stale consumer allow rule')
  assert.equal(overlapMerged.settings.permissions.allow.includes(destructiveRule), false, 'canonical deny must outrank a stale consumer allow rule')
  assert.deepEqual(
    overlapMerged.settings.permissions.ask,
    productAdapter.permissions.ask,
    'refresh must replace stale or consumer-owned ask semantics with the authenticated canonical human-only set',
  )
  assert.equal(overlapMerged.settings.permissions.ask.includes('Bash(git push *)'), false)
  assert.equal(overlapMerged.settings.permissions.ask.includes('Bash(npm publish *)'), false)
  assert.equal(overlapMerged.settings.permissions.ask.includes('Bash(my-consumer-owned-sensitive-tool *)'), false)
  assert.equal(overlapMerged.settings.permissions.deny.includes(destructiveRule), true)
  assert.deepEqual(overlapMerged.settings.sandbox, policy.sandbox, 'canonical sandbox must replace a stale or weaker consumer sandbox')
  assertClaudePermissionMaterialization(overlapMerged.settings, policy, { label: 'safely refreshed overlapping consumer permissions' })

  // A second template-backed provider must be data-only: the same inventory validator and pure
  // merge engine handle it without a provider-id branch or a single-surface assumption.
  const multiManifest = structuredClone(manifest)
  multiManifest.materializers.hookViews['future-static-settings-v1'] = {
    engine: 'json-hook-map-v1',
    hooksField: 'eventHooks',
    descriptionField: 'description',
    mergeStrategy: 'merge-hook-map-into-base-v1',
    baseTemplateContract: 'static-json-object-v1',
  }
  multiManifest.providerSurfaces['future-merge'] = {
    generated: true,
    hookMaterializerId: 'future-static-settings-v1',
    hookArtifact: 'providers/future-merge/hook-config.json',
    hookDestination: '.future-merge/settings.json',
  }
  const multiPolicy = structuredClone(refreshPolicy)
  multiPolicy.surfaces['future-merge'] = {
    schemaVersion: 1,
    hookArtifact: 'providers/future-merge/hook-config.json',
    hookDestination: '.future-merge/settings.json',
    hookMaterializerId: 'future-static-settings-v1',
    mergeStrategy: 'merge-hook-map-into-base-v1',
    baseTemplateContract: 'static-json-object-v1',
    permissionPolicy: null,
    retiredHookRegistrations: [],
  }
  const validatedMultiPolicy = validateCanonicalSettingsWiring(multiPolicy, multiManifest)
  assert.deepEqual(Object.keys(validatedMultiPolicy.surfaces).sort(), ['claude', 'future-merge'])
  const futureMerged = mergeProviderHookSettings({
    settings: {
      consumerOwned: { retained: true },
      permissions: { stale: true },
      futureModeFlag: 'consumer-stale',
      eventHooks: { OldEvent: [{ hooks: [{ type: 'command', command: 'old' }] }] },
    },
    canonicalConfig: {
      description: 'locked future adapter',
      baseSetting: 'canonical',
      permissions: { providerSpecific: true },
      futureModeFlag: 'future-provider-canonical',
      eventHooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'new' }] }] },
    },
    policy: validatedMultiPolicy.surfaces['future-merge'],
    label: 'future merge fixture',
  })
  assert.deepEqual(futureMerged.settings, {
    consumerOwned: { retained: true },
    eventHooks: {
      OldEvent: [{ hooks: [{ type: 'command', command: 'old' }] }],
      PreToolUse: [{ hooks: [{ type: 'command', command: 'new' }] }],
    },
    description: 'locked future adapter',
    baseSetting: 'canonical',
    permissions: { providerSpecific: true },
    futureModeFlag: 'future-provider-canonical',
  })
  const missingFuturePolicy = structuredClone(multiPolicy)
  delete missingFuturePolicy.surfaces['future-merge']
  assert.throws(
    () => validateCanonicalSettingsWiring(missingFuturePolicy, multiManifest),
    /do not exactly match merge-capable provider surfaces/,
  )
}

console.log('claude-permission-policy: PASS(provider-neutral engineering delegation; human-only ask; destructive/bypass deny; DS/product/managed profiles derived)')
