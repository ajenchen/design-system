import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo as operatingSystemUserInfo } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  attachRuntimeEvidenceAttestation,
  computeRuntimeHarnessDigest,
  defaultProcessRunner,
  detectExecutionEnvironment,
  localRuntimeProviderIds,
  prepareClaudeReviewCapabilityProbe,
  redactText,
  requiredRuntimeChecksPass,
  resolveGitIdentity,
  runRuntimeConformance,
  runtimeConformancePaths,
  runtimeEvidenceSigningPayload,
  runtimeHarnessIdentity,
  runtimeHarnessIdentityFromRepository,
  runtimeHarnessPaths,
  validateLocalRuntimeAccountIdentity,
  validateRuntimeEvidence,
  validateRuntimeEvidenceProfileBinding,
  verifyRuntimeEvidenceAttestation,
  validateRuntimeProfile,
} from '../lib/provider-runtime-conformance.mjs'
import {
  readJson,
  resolveClosedGitExecutable,
  runClosedGit,
  sha256,
  stableStringify,
  validateClosedGitExecutable,
} from '../lib/common.mjs'
import { promoteRuntimeEvidence } from '../bin/promote-runtime-evidence.mjs'
import { validateCertifications } from '../lib/model-validation.mjs'
import {
  currentRuntimeCertificationIdentity,
  validateRuntimeCheckCoverage,
} from '../lib/runtime-certification.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import {
  buildRepositorySubjectProof,
  resolveLocalRepositoryIdentity,
} from '../lib/repository-subject-proof.mjs'
import { captureDeepAuditSnapshot } from '../../../scripts/lib/deep-audit-evidence-contract.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const PROVIDER_RUNTIME_PROBE = resolve(
  REPO_ROOT,
  'scripts/test-fixtures/transitive-execution/provider-runtime-probe.mjs',
)
const PROVIDER_RUNTIME_PROCESS_TREE_PARENT = resolve(
  REPO_ROOT,
  'scripts/test-fixtures/transitive-execution/provider-runtime-process-tree-parent.mjs',
)
const PROFILE_PATH = runtimeConformancePaths.defaultProfilePath
const CERTIFICATIONS_PATH = resolve(GOVERNANCE_ROOT, 'providers/certifications.json')
const IDENTITY = {
  gitHead: '1'.repeat(40),
  gitTree: '2'.repeat(40),
  worktreeDirty: true,
}
const CONTRACT = {
  contractDigest: `sha256:${'3'.repeat(64)}`,
  valid: true,
  blockingDiagnosticIds: [],
  registeredProviderIds: ['claude', 'codex', 'generic'],
}
const RUN_AT = new Date('2026-07-27T09:00:00.000Z')
const PROMOTION_AT = new Date('2026-07-27T10:00:00.000Z')
const RUN_ID = '11111111-1111-4111-8111-111111111111'
const HOST = {
  operatingSystem: 'macos',
  platform: 'darwin',
  arch: 'arm64',
  executionEnvironment: 'native',
  pathClass: 'no-space',
  hostDigest: `sha256:${'4'.repeat(64)}`,
}

test('Linux cloud-development markers map to the declared devcontainer target', () => {
  assert.equal(detectExecutionEnvironment('linux', {}), 'native')
  assert.equal(detectExecutionEnvironment('linux', { CODESPACES: 'true' }), 'devcontainer')
  assert.equal(detectExecutionEnvironment('linux', { REMOTE_CONTAINERS: 'true' }), 'devcontainer')
  assert.equal(detectExecutionEnvironment('linux', { DEVCONTAINER: 'true' }), 'devcontainer')
  assert.equal(detectExecutionEnvironment('linux', { WSL_DISTRO_NAME: 'Ubuntu', CODESPACES: 'true' }), 'wsl2')
  assert.equal(detectExecutionEnvironment('linux', { WSL_DISTRO_NAME: 'Ubuntu', CI: 'true' }), 'github-hosted-runner')
  assert.equal(detectExecutionEnvironment('linux', { DEVCONTAINER: 'true', GITHUB_ACTIONS: 'true' }), 'github-hosted-runner')
  assert.equal(detectExecutionEnvironment('linux', { WSL_DISTRO_NAME: 'Ubuntu', SSH_CONNECTION: 'fixture' }), 'remote-host')
  assert.equal(detectExecutionEnvironment('linux', { DEVCONTAINER: 'true', SSH_TTY: 'fixture' }), 'remote-host')
  assert.equal(detectExecutionEnvironment('darwin', { CODESPACES: 'true' }), 'native')
  assert.equal(detectExecutionEnvironment('darwin', { SSH_CONNECTION: 'fixture' }), 'remote-host')
  assert.equal(detectExecutionEnvironment('linux', { GITHUB_ACTIONS: 'true' }), 'github-hosted-runner')
  assert.equal(detectExecutionEnvironment('linux', { CI: 'false' }), 'native')
})

function certificationIdentity({ executable, rootPath, platform, arch }) {
  const authorityDigest = sha256('mock-provider-cli-authority')
  const lockDigest = sha256('mock-provider-cli-lock')
  const toolchainPlatform = `${platform}-${arch}`
  const shimPath = `node_modules/.bin/${executable}`
  const targetPath = `node_modules/.provider-cli-toolchain/content-v2/${toolchainPlatform}/${authorityDigest}/node_modules/@mock/${executable}/bin/${executable}`
  return {
    argsPrefix: [resolve(rootPath, shimPath)],
    binding: {
      activePackageContentDigest: sha256(`mock-active-content:${executable}:${toolchainPlatform}`),
      authorityDigest,
      executable,
      lockDigest,
      packageContentProtocol: 'npm-ustar-package-tree-v1',
      platform: toolchainPlatform,
      shimPath,
      shimSha256: sha256(`mock-shim:${executable}`),
      targetPath,
      targetSha256: sha256(`mock-target:${executable}`),
    },
    command: process.execPath,
    target: resolve(rootPath, targetPath),
  }
}

function successMockRunner(overrides = {}) {
  return async ({ command, metadata, args, input }) => {
    const fixture = metadata.fixture
    if (metadata.driver === 'version') {
      assert.equal(command, process.execPath)
      assert.equal(args[0], resolve(REPO_ROOT, `node_modules/.bin/${metadata.provider === 'claude' ? 'claude' : 'codex'}`))
      const version = metadata.provider === 'claude' ? '2.1.215' : '0.144.6'
      return {
        exitCode: 0,
        stdout: `${metadata.provider}-cli ${version}\n`,
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'claude-entitlement-readback') {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          subscriptionType: 'max',
        }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'claude-authority-routing') {
      const providerArguments = args.slice(1)
      assert.equal(providerArguments[providerArguments.indexOf('--output-format') + 1], 'json')
      assert.equal(providerArguments[providerArguments.indexOf('--setting-sources') + 1], 'project')
      assert.equal(providerArguments[providerArguments.indexOf('--max-budget-usd') + 1], '0.10')
      assert.equal(providerArguments[providerArguments.indexOf('--model') + 1], 'haiku')
      assert.equal(providerArguments[providerArguments.indexOf('--tools') + 1], '')
      assert.equal(providerArguments[providerArguments.indexOf('--permission-mode') + 1], 'plan')
      assert.equal(providerArguments[providerArguments.indexOf('--mcp-config') + 1], '{"mcpServers":{}}')
      assert.ok(providerArguments.includes('--no-session-persistence'))
      assert.ok(providerArguments.includes('--strict-mcp-config'))
      assert.equal(providerArguments.includes('--safe-mode'), false, 'authority routing must keep CLAUDE.md auto-discovery enabled')
      assert.ok(providerArguments.includes('--no-chrome'))
      const responseSchema = JSON.parse(providerArguments[providerArguments.indexOf('--json-schema') + 1])
      assert.deepEqual(responseSchema.properties.engineering.enum, ['AUTO', 'ASK', 'HUMAN_ONLY'])
      assert.equal(responseSchema.additionalProperties, false)
      const fixtureInstructions = readFileSync(join(fixture.root, 'AGENTS.md'), 'utf8')
      assert.match(fixtureInstructions, new RegExp(`^Public runtime project-instruction evidence: ${fixture.tokens.publicProjectInstructionEvidence}$`, 'm'))
      assert.match(fixtureInstructions, /canonical-decision-authority:start/)
      assert.match(fixtureInstructions, /Decision／Engineering Authority/)
      assert.match(fixtureInstructions, /Human-only boundaries/)
      assert.match(providerArguments.at(-1), /engineering: implement and verify/)
      assert.match(providerArguments.at(-1), /Public runtime project-instruction evidence: <value>/)
      assert.match(providerArguments.at(-1), /current durable authority policy/)
      assert.match(providerArguments.at(-1), /Do not invent missing target details or an additional approval gate/)
      assert.match(providerArguments.at(-1), /approvedVisualBaseline:/)
      assert.match(providerArguments.at(-1), /without another approval, key enrollment, or signature/)
      assert.match(providerArguments.at(-1), /unresolvedUiUxSsot:/)
      assert.match(providerArguments.at(-1), /missingCredentialReference:/)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          structured_output: {
            publicProjectInstructionEvidence: fixture.tokens.publicProjectInstructionEvidence,
            engineering: 'AUTO',
            git: 'AUTO',
            pullRequest: 'AUTO',
            ci: 'AUTO',
            release: 'AUTO',
            approvedVisualBaseline: 'AUTO',
            unresolvedUiUxSsot: 'ASK',
            login: 'HUMAN_ONLY',
            mfa: 'HUMAN_ONLY',
            oauth: 'HUMAN_ONLY',
            ownerAction: 'HUMAN_ONLY',
            billing: 'HUMAN_ONLY',
            missingCredentialReference: 'HUMAN_ONLY',
          },
        }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'claude-review-capability-probe') {
      const providerArguments = args.slice(1)
      const model = providerArguments[providerArguments.indexOf('--model') + 1]
      assert.ok(model.startsWith('claude-'))
      assert.equal(providerArguments.includes('--max-budget-usd'), false)
      assert.equal(providerArguments[providerArguments.indexOf('--effort') + 1], 'max')
      assert.equal(providerArguments[providerArguments.indexOf('--tools') + 1], '')
      assert.equal(
        providerArguments[providerArguments.indexOf('--mcp-config') + 1],
        '{"mcpServers":{}}',
      )
      assert.ok(providerArguments.includes('--no-session-persistence'))
      assert.ok(providerArguments.includes('--strict-mcp-config'))
      assert.ok(providerArguments.includes('--safe-mode'))
      assert.ok(providerArguments.includes('--no-chrome'))
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          modelUsage: { [model]: { inputTokens: 1, outputTokens: 1 } },
          structured_output: { availability: 'observed' },
        }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'claude-context-fork') {
      const providerArguments = args.slice(1)
      assert.equal(providerArguments[providerArguments.indexOf('--max-budget-usd') + 1], '0.10')
      assert.equal(providerArguments[providerArguments.indexOf('--mcp-config') + 1], '{"mcpServers":{}}')
      assert.ok(providerArguments.includes('--no-session-persistence'))
      assert.ok(providerArguments.includes('--strict-mcp-config'))
      const fixtureSkill = readFileSync(join(fixture.root, '.claude/skills/canonical-reviewer/SKILL.md'), 'utf8')
      const fixtureAgent = readFileSync(join(fixture.root, '.claude/agents/canonical-reviewer.md'), 'utf8')
      const fixtureInstructions = readFileSync(join(fixture.root, 'AGENTS.md'), 'utf8')
      assert.equal(fixtureSkill, readFileSync(resolve(REPO_ROOT, '.claude/skills/canonical-reviewer/SKILL.md'), 'utf8'))
      assert.equal(fixtureAgent, readFileSync(resolve(REPO_ROOT, '.claude/agents/canonical-reviewer.md'), 'utf8'))
      assert.match(fixtureInstructions, /public, non-secret runtime evidence/)
      assert.match(providerArguments.at(-1), /public, non-secret runtime instruction evidence/)
      assert.match(fixtureSkill, /^context: fork$/m)
      assert.match(fixtureSkill, /^agent: canonical-reviewer$/m)
      return {
        exitCode: 0,
        stdout: JSON.stringify({ parent_tool_use_id: 'fixture-fork', text: `REVIEW-BLOCKED\nadapterEvidence: CLAUDE_CANONICAL_REVIEWER_AGENT_V1\npublicProjectInstructionEvidence: ${fixture.tokens.publicProjectInstructionEvidence}` }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'claude-native-block') {
      const providerArguments = args.slice(1)
      assert.equal(providerArguments[providerArguments.indexOf('--max-budget-usd') + 1], '0.10')
      assert.equal(providerArguments[providerArguments.indexOf('--mcp-config') + 1], '{"mcpServers":{}}')
      assert.ok(providerArguments.includes('--no-session-persistence'))
      assert.ok(providerArguments.includes('--strict-mcp-config'))
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: 'hook_progress', reason: fixture.tokens.hook }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'codex-debug-discovery') {
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          { type: 'message', text: fixture.tokens.publicProjectInstructionEvidence },
          { type: 'skill', text: `${fixture.tokens.skill} .agents/skills/runtime-conformance-probe/SKILL.md` },
        ]),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'codex-native-hook-lifecycle') {
      const hooks = JSON.parse(readFileSync(join(fixture.root, '.codex/hooks.json'), 'utf8'))
      assert.equal(hooks.hooks.PreToolUse[0].matcher, 'Edit|Write', 'Codex apply_patch must exercise official Edit/Write aliases')
      assert.equal(hooks.hooks.PostToolUse[0].matcher, 'Bash', 'Codex unified exec must match as Bash')
      const fixtureCommands = [
        hooks.hooks.PreToolUse[0].hooks[0].command,
        hooks.hooks.PostToolUse[0].hooks[0].command,
      ]
      assert.equal(fixtureCommands.some(command => /(?:^|[\s"'(])git(?:[\s"'$)]|$)/.test(command)), false, 'isolated Codex fixture hooks must not resolve Git through ambient PATH')
      assert.match(fixtureCommands[0], /^\/bin\/bash '/, 'isolated Codex fixture must use the absolute system shell')
      assert.match(fixtureCommands[1], new RegExp(`^'${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}' `), 'isolated Codex fixture must use the active absolute Node executable')
      const observer = readFileSync(join(fixture.root, '.codex/hooks/runtime-post-observe.mjs'), 'utf8')
      assert.match(observer, /input\.hook_event_name !== 'PostToolUse'/)
      assert.match(observer, /input\.tool_name !== 'Bash'/)
      writeFileSync(fixture.bashTarget, 'runtime-probe\n')
      writeFileSync(fixture.postMarker, `${fixture.tokens.hook}\n`)
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: 'hook_event', reason: fixture.tokens.hook }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver === 'generated-provider-adapter-block') {
      const payload = JSON.parse(input)
      assert.equal(payload.hook_event_name, 'PreToolUse')
      assert.equal(payload.tool_name, metadata.provider === 'codex' ? 'apply_patch' : 'Write')
      assert.equal(payload.tool_input.file_path, 'governance/generated/runtime-conformance-forbidden.json')
      return {
        exitCode: 2,
        stdout: '',
        stderr: 'Direct writes to generated governance artifacts are blocked.\ngovernance/generated/runtime-conformance-forbidden.json\n',
        timedOut: false,
        outputExceeded: false,
        ...overrides[metadata.driver],
      }
    }
    if (metadata.driver.startsWith('provider-hook-runner-')) {
      assert.equal(command, process.execPath)
      assert.equal(args[0], resolve(REPO_ROOT, 'scripts/run-provider-hook.mjs'))
      assert.deepEqual(args.slice(1, 5), ['--provider', metadata.provider, '--hook', metadata.hook])
      const payload = JSON.parse(input)
      if (metadata.driver === 'provider-hook-runner-pass') {
        assert.equal(metadata.hook, 'check_canonical_propagation.sh')
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, outputExceeded: false, ...overrides[metadata.driver] }
      }
      if (metadata.driver === 'provider-hook-runner-block') {
        assert.equal(metadata.hook, 'check_canonical_propagation.sh')
        return {
          exitCode: 2,
          stdout: '',
          stderr: 'principles canonical BLOCKER\napps/runtime/src/runtime.principles.stories.tsx\n',
          timedOut: false,
          outputExceeded: false,
          ...overrides[metadata.driver],
        }
      }
      if (metadata.driver === 'provider-hook-runner-context') {
        assert.equal(metadata.hook, 'session_start_governance_check.sh')
        const stdout = metadata.provider === 'claude'
          ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Hook count 52 requires governance review.' } })
          : JSON.stringify({ systemMessage: 'Hook count 52 requires governance review.' })
        return { exitCode: 0, stdout, stderr: '', timedOut: false, outputExceeded: false, ...overrides[metadata.driver] }
      }
      if (metadata.driver === 'provider-hook-runner-stop') {
        assert.equal(metadata.hook, 'check_orphan_ds_css.sh')
        const reason = 'ORPHAN-DS-CSS BLOCKER: runtime-conformance-orphan.css'
        const stdout = JSON.stringify(metadata.provider === 'claude' ? { decision: 'block', reason } : { continue: false, stopReason: reason })
        return { exitCode: 0, stdout, stderr: '', timedOut: false, outputExceeded: false, ...overrides[metadata.driver] }
      }
      assert.fail(`Unexpected unified runner driver ${metadata.driver}: ${JSON.stringify(payload)}`)
    }
    throw new Error(`Unexpected mocked command: ${metadata.driver} ${args.join(' ')}`)
  }
}

async function mockedRun(options = {}) {
  return runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'all',
    allowModel: true,
    runner: successMockRunner(options.overrides),
    gitIdentityResolver: options.gitIdentityResolver || (() => IDENTITY),
    contractIdentityResolver: options.contractIdentityResolver || (async () => options.contract || CONTRACT),
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => HOST,
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    ...(options.harnessPathsResolver ? { harnessPathsResolver: options.harnessPathsResolver } : {}),
    writeEvidence: false,
  })
}

function redigestEvidence(evidence) {
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = evidence
  evidence.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  evidence.attestation.evidenceDigest = evidence.evidenceDigest
  return evidence
}

function productionSafetyFixtureFromTestSeamEvidence(evidence) {
  const fixture = structuredClone(evidence)
  fixture.safety.temporaryCredentialHandling = 'codex-auth-copy-if-available-0700-deleted-after-probe'
  fixture.safety.processEnvironmentPolicy = 'closed-explicit-allowlist-v1'
  fixture.safety.providerExecutableAuthority = 'repo-content-v2-certification-v1'
  return redigestEvidence(fixture)
}

test('mocked Claude and Codex CLIs produce deterministic semantic evidence without model or network access', async () => {
  const before = sha256(readFileSync(CERTIFICATIONS_PATH))
  const profile = readJson(PROFILE_PATH)
  const first = await mockedRun()
  const second = await mockedRun()

  assert.equal(profile.providers.length, 8, 'committed profile must retain the complete local plus external provider catalog')
  assert.equal(localRuntimeProviderIds(profile).length, 2, 'committed profile must expose exactly the two locally probeable providers')
  assert.equal(first.evidence.status, 'pass')
  assert.equal(first.evidence.scope, 'local-fleet')
  assert.deepEqual(first.evidence.providers.map(provider => provider.id).sort(), localRuntimeProviderIds(profile))
  assert.deepEqual(
    profile.providers.filter(provider => provider.executionMode === 'external-attested').map(provider => provider.id).sort(),
    ['claude-code-cli-remote', 'claude-code-cloud', 'codex-cloud', 'codex-desktop-local', 'codex-desktop-remote', 'github-actions-hosted'],
  )
  assert.deepEqual(first.evidence, second.evidence)
  assert.equal(validateRuntimeEvidence(first.evidence), true)
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validateProfileSchema = ajv.compile(readJson(resolve(GOVERNANCE_ROOT, 'schemas/runtime-conformance-profile.schema.json')))
  assert.equal(validateProfileSchema(profile), true, ajv.errorsText(validateProfileSchema.errors))
  const optionalAuthorityRoutingProfile = structuredClone(profile)
  optionalAuthorityRoutingProfile.providers.find(provider => provider.id === 'claude')
    .checks.find(check => check.driver === 'claude-authority-routing')
    .certificationImpact = 'capability-only'
  assert.equal(validateProfileSchema(optionalAuthorityRoutingProfile), false, 'schema must keep decision-authority-routing required')
  const missingAuthorityRoutingProfile = structuredClone(profile)
  const missingSchemaClaude = missingAuthorityRoutingProfile.providers.find(provider => provider.id === 'claude')
  missingSchemaClaude.checks = missingSchemaClaude.checks
    .filter(check => check.driver !== 'claude-authority-routing')
  assert.equal(validateProfileSchema(missingAuthorityRoutingProfile), false, 'schema must require decision-authority-routing')
  const duplicateAuthorityRoutingProfile = structuredClone(profile)
  const duplicateSchemaClaude = duplicateAuthorityRoutingProfile.providers.find(provider => provider.id === 'claude')
  duplicateSchemaClaude.checks.push(structuredClone(
    duplicateSchemaClaude.checks.find(check => check.driver === 'claude-authority-routing'),
  ))
  assert.equal(validateProfileSchema(duplicateAuthorityRoutingProfile), false, 'schema must reject duplicate decision-authority-routing checks')
  const validateSchema = ajv.compile(readJson(resolve(GOVERNANCE_ROOT, 'schemas/runtime-conformance-evidence.schema.json')))
  assert.equal(validateSchema(first.evidence), true, ajv.errorsText(validateSchema.errors))
  const claudeLocalAccountSafety = structuredClone(first.evidence)
  claudeLocalAccountSafety.safety.temporaryCredentialHandling = 'claude-local-account-reference-bounded-probes-v1'
  redigestEvidence(claudeLocalAccountSafety)
  assert.equal(validateRuntimeEvidence(claudeLocalAccountSafety), true)
  assert.equal(validateSchema(claudeLocalAccountSafety), true, ajv.errorsText(validateSchema.errors))
  const legacyClaudeAuthSafety = structuredClone(first.evidence)
  legacyClaudeAuthSafety.safety.temporaryCredentialHandling = 'claude-auth-status-read-only-home-reference'
  redigestEvidence(legacyClaudeAuthSafety)
  assert.equal(validateRuntimeEvidence(legacyClaudeAuthSafety), true)
  assert.equal(validateSchema(legacyClaudeAuthSafety), true, ajv.errorsText(validateSchema.errors))
  const combinedClaudeCodexSafety = structuredClone(first.evidence)
  combinedClaudeCodexSafety.safety.temporaryCredentialHandling = 'claude-local-account-and-codex-auth-copy-bounded-probes-v1'
  redigestEvidence(combinedClaudeCodexSafety)
  assert.equal(validateRuntimeEvidence(combinedClaudeCodexSafety), true)
  assert.equal(validateSchema(combinedClaudeCodexSafety), true, ajv.errorsText(validateSchema.errors))
  assert.equal(
    stableStringify(claudeLocalAccountSafety, 0).includes(operatingSystemUserInfo().homedir),
    false,
    'runtime evidence must record environment names, never the OS-derived HOME value',
  )
  const numericPrimaryIssuer = structuredClone(first.evidence)
  numericPrimaryIssuer.attestation = {
    ...numericPrimaryIssuer.attestation,
    status: 'verified',
    issuerId: '1.fixture_issuer',
    signature: Buffer.alloc(64, 1).toString('base64'),
  }
  assert.equal(validateRuntimeEvidence(numericPrimaryIssuer), true, 'primary issuer IDs must accept the canonical registry/cosigner grammar')
  assert.equal(validateSchema(numericPrimaryIssuer), true, ajv.errorsText(validateSchema.errors))
  const invalidPrimaryIssuer = structuredClone(numericPrimaryIssuer)
  invalidPrimaryIssuer.attestation.issuerId = '.fixture-issuer'
  assert.throws(() => validateRuntimeEvidence(invalidPrimaryIssuer), /Verified runtime evidence issuer id is invalid/)
  assert.equal(validateSchema(invalidPrimaryIssuer), false, 'schema and runtime validation must reject the same invalid primary issuer grammar')
  const missingTargetBinding = structuredClone(first.evidence)
  delete missingTargetBinding.providers[0].tool.distribution.targetContentDigest
  assert.equal(validateSchema(missingTargetBinding), false, 'runtime evidence schema must close the target-content binding')
  const claudeVersionAccountSubstitution = structuredClone(first.evidence)
  claudeVersionAccountSubstitution.providers.find(provider => provider.id === 'claude')
    .tool.command.environmentNames = ['HOME', 'USER']
  redigestEvidence(claudeVersionAccountSubstitution)
  assert.throws(
    () => validateRuntimeEvidence(claudeVersionAccountSubstitution),
    /Claude version command must use only the isolated fixture HOME/,
  )
  assert.equal(first.evidence.providers.find(provider => provider.id === 'claude').checks.length, 15)
  assert.equal(first.evidence.providers.find(provider => provider.id === 'codex').checks.length, 7)
  assert.ok(first.evidence.providers.flatMap(provider => provider.checks).every(check => check.status === 'pass'))
  const authorityRouting = first.evidence.providers.find(provider => provider.id === 'claude')
    .checks.find(check => check.id === 'decision-authority-routing')
  assert.equal(authorityRouting.driver, 'claude-authority-routing')
  assert.equal(authorityRouting.certificationImpact, 'required')
  assert.equal(authorityRouting.status, 'pass')
  assert.deepEqual(
    Object.fromEntries(authorityRouting.result.assertions
      .filter(item => item.id.startsWith('authority-routing-'))
      .map(item => [item.id, item.pass])),
    {
      'authority-routing-result-success': true,
      'authority-routing-structured-output-closed': true,
      'authority-routing-engineering-auto': true,
      'authority-routing-git-auto': true,
      'authority-routing-pull-request-auto': true,
      'authority-routing-ci-auto': true,
      'authority-routing-release-auto': true,
      'authority-routing-approved-visual-baseline-auto': true,
      'authority-routing-unresolved-ui-ux-ssot-ask': true,
      'authority-routing-login-human-only': true,
      'authority-routing-mfa-human-only': true,
      'authority-routing-oauth-human-only': true,
      'authority-routing-owner-action-human-only': true,
      'authority-routing-billing-human-only': true,
      'authority-routing-missing-credential-reference-human-only': true,
    },
  )
  const entitlementReadback = first.evidence.providers.find(provider => provider.id === 'claude')
    .checks.find(check => check.id === 'subscription-entitlement-readback')
  assert.equal(entitlementReadback.certificationImpact, 'capability-only')
  assert.equal(entitlementReadback.command.cwd, '<fixture>')
  assert.deepEqual(entitlementReadback.command.arguments, ['auth', 'status', '--json'])
  for (const mutate of [
    check => { check.command.cwd = '<repo>' },
    check => { check.command.arguments = ['auth', 'status'] },
  ]) {
    const substitutedEntitlementRoute = structuredClone(first.evidence)
    const check = substitutedEntitlementRoute.providers.find(provider => provider.id === 'claude')
      .checks.find(candidate => candidate.driver === 'claude-entitlement-readback')
    mutate(check)
    redigestEvidence(substitutedEntitlementRoute)
    assert.throws(
      () => validateRuntimeEvidence(substitutedEntitlementRoute),
      /does not bind the exact Claude entitlement readback route/,
    )
  }
  assert.equal(first.evidence.safety.certificationLedgerWrites, false)
  assert.equal(first.evidence.safety.temporaryCredentialHandling, 'nonproduction-test-seam-no-credential-claim')
  assert.equal(first.evidence.safety.processEnvironmentPolicy, 'nonproduction-test-seam-no-environment-claim')
  assert.equal(first.evidence.safety.providerExecutableAuthority, 'nonproduction-test-seam-no-provider-authority-claim')
  assert.equal(sha256(readFileSync(CERTIFICATIONS_PATH)), before, 'runtime probes must never rewrite certifications')
})

test('Claude Max capability probes follow exact provider-local precedence and stop after the first available model', async () => {
  const baseRunner = successMockRunner()
  const invokedModels = []
  const runner = async options => {
    if (options.metadata.driver !== 'claude-review-capability-probe') {
      return baseRunner(options)
    }
    const providerArguments = options.args.slice(1)
    const model = providerArguments[providerArguments.indexOf('--model') + 1]
    invokedModels.push(model)
    assert.equal(providerArguments.includes('--max-budget-usd'), false)
    if (model === 'claude-fable-5') {
      return {
        exitCode: 1,
        stdout: JSON.stringify({
          type: 'result',
          is_error: true,
          error: {
            code: 'model_not_available_for_org',
            model,
          },
        }),
        stderr: '',
        timedOut: false,
        outputExceeded: false,
      }
    }
    assert.equal(model, 'claude-opus-5')
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        modelUsage: { [model]: { inputTokens: 1, outputTokens: 1 } },
        structured_output: { availability: 'observed' },
      }),
      stderr: '',
      timedOut: false,
      outputExceeded: false,
    }
  }
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'claude',
    allowModel: true,
    runner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => HOST,
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    writeEvidence: false,
  })
  assert.deepEqual(invokedModels, ['claude-fable-5', 'claude-opus-5'])
  const probes = evidence.providers[0].checks.filter(
    check => check.driver === 'claude-review-capability-probe',
  )
  assert.deepEqual(probes.map(check => check.id), [
    'review-capability-claude-max-code-fable-5',
    'review-capability-claude-max-code-opus-5',
    'review-capability-claude-max-code-opus-4-8',
    'review-capability-claude-max-code-sonnet-5',
    'review-capability-claude-max-code-sonnet-4-5',
    'review-capability-claude-max-code-haiku-4-5',
  ])
  assert.equal(
    probes[0].result.assertions.some(
      item => item.id === 'review-capability-outcome-permanently-unavailable'
        && item.pass,
    ),
    true,
  )
  assert.equal(
    probes[1].result.assertions.some(
      item => item.id === 'review-capability-outcome-available' && item.pass,
    ),
    true,
  )
  assert.ok(probes.slice(2).every(check => (
    check.result.exitCode === null
    && check.result.assertions.some(
      item => item.id === 'review-capability-outcome-not-probed-below-selected'
        && item.pass,
    )
  )))
  const forged = structuredClone(evidence)
  const availableProbe = forged.providers[0].checks.find(check => (
    check.result.assertions.some(
      item => item.id === 'review-capability-outcome-available' && item.pass,
    )
  ))
  availableProbe.command.arguments.push('--max-budget-usd', '0.10')
  redigestEvidence(forged)
  assert.throws(
    () => validateRuntimeEvidence(forged, { expectedProviderIds: ['claude'] }),
    /does not bind the exact isolated maximum-compute review capability probe/,
  )
})

test('transient or quota-like highest-capability outcomes block all lower Claude Max probes', async () => {
  const baseRunner = successMockRunner()
  const invokedModels = []
  const runner = async options => {
    if (options.metadata.driver !== 'claude-review-capability-probe') {
      return baseRunner(options)
    }
    const providerArguments = options.args.slice(1)
    const model = providerArguments[providerArguments.indexOf('--model') + 1]
    invokedModels.push(model)
    return {
      exitCode: 1,
      stdout: JSON.stringify({
        type: 'result',
        is_error: true,
        error: {
          code: 'capacity_exhausted',
          model,
        },
      }),
      stderr: '',
      timedOut: false,
      outputExceeded: false,
    }
  }
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'claude',
    allowModel: true,
    runner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => HOST,
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    writeEvidence: false,
  })
  assert.deepEqual(invokedModels, ['claude-fable-5'])
  const probes = evidence.providers[0].checks.filter(
    check => check.driver === 'claude-review-capability-probe',
  )
  assert.equal(probes[0].status, 'fail')
  assert.ok(probes.slice(1).every(check => (
    check.status === 'fail'
    && check.result.exitCode === null
    && check.result.assertions.some(
      item => item.id === 'review-capability-outcome-not-probed-higher-unverified'
        && !item.pass,
    )
  )))
})

test('Claude Max capability profile order is exact and cannot drift from provider-local rank', () => {
  const profile = readJson(PROFILE_PATH)
  const claude = profile.providers.find(provider => provider.id === 'claude')
  const indexes = claude.checks.flatMap((check, index) => (
    check.driver === 'claude-review-capability-probe' ? [index] : []
  ))
  assert.equal(indexes.length, 6)
  const substituted = structuredClone(profile)
  const substitutedClaude = substituted.providers.find(provider => provider.id === 'claude')
  ;[
    substitutedClaude.checks[indexes[1]],
    substitutedClaude.checks[indexes[2]],
  ] = [
    substitutedClaude.checks[indexes[2]],
    substitutedClaude.checks[indexes[1]],
  ]
  assert.throws(
    () => validateRuntimeProfile(substituted),
    /exact provider-local highest-to-lowest subscription candidate schedule/,
  )
})

test('local CLI probes cannot substitute for Codex Desktop external attestation', async () => {
  let invocationCount = 0
  for (const providerFilter of [
    'claude-code-cli-remote',
    'claude-code-cloud',
    'codex-cloud',
    'codex-desktop-local',
    'codex-desktop-remote',
    'github-actions-hosted',
  ]) {
    await assert.rejects(() => runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath: PROFILE_PATH,
      providerFilter,
      allowModel: true,
      runner: async () => {
        invocationCount += 1
        throw new Error('an external-attested profile must not invoke the local CLI runner')
      },
      gitIdentityResolver: () => IDENTITY,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => HOST,
      runIdResolver: () => RUN_ID,
      clock: () => RUN_AT,
      providerInvocationObserver: () => {
        invocationCount += 1
      },
      writeEvidence: false,
    }), new RegExp(`Unknown or externally-attested runtime provider filter ${providerFilter}`))
  }
  assert.equal(invocationCount, 0, 'Codex CLI evidence was invoked for an external-attested Desktop target')
})

test('OS-derived local account identity rejects ambient mismatch, aliases, foreign ownership, and insecure homes', () => {
  assert.equal(typeof process.getuid, 'function', 'runtime conformance local account probes require POSIX uid support')
  const currentUid = process.getuid()
  const fixture = realpathSync(mkdtempSync(resolve(tmpdir(), 'runtime-account-identity-')))
  const home = resolve(fixture, 'home')
  const homeAlias = resolve(fixture, 'home-alias')
  mkdirSync(home, { mode: 0o700 })
  const identity = {
    home,
    uid: currentUid,
    username: 'runtime-fixture-user',
  }
  try {
    assert.deepEqual(validateLocalRuntimeAccountIdentity(identity, {
      ambientEnvironment: { HOME: home, USER: identity.username },
      currentUid,
    }), identity)
    assert.throws(() => validateLocalRuntimeAccountIdentity(identity, {
      ambientEnvironment: { HOME: resolve(fixture, 'other-home'), USER: identity.username },
      currentUid,
    }), /Ambient HOME differs/)
    assert.throws(() => validateLocalRuntimeAccountIdentity(identity, {
      ambientEnvironment: { HOME: home, USER: 'substituted-user' },
      currentUid,
    }), /Ambient USER differs/)

    symlinkSync(home, homeAlias)
    assert.throws(() => validateLocalRuntimeAccountIdentity({
      ...identity,
      home: homeAlias,
    }, {
      ambientEnvironment: { HOME: homeAlias, USER: identity.username },
      currentUid,
    }), /real non-symlink directory/)

    assert.throws(() => validateLocalRuntimeAccountIdentity({
      ...identity,
      uid: currentUid + 1,
    }, {
      ambientEnvironment: { HOME: home, USER: identity.username },
      currentUid: currentUid + 1,
    }), /not owned by the current process uid/)

    chmodSync(home, 0o777)
    assert.throws(() => validateLocalRuntimeAccountIdentity(identity, {
      ambientEnvironment: { HOME: home, USER: identity.username },
      currentUid,
    }), /must not be writable by group or other users/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('cloud-development probes never receive a local USER and remote or CI hosts fail before local execution', async () => {
  const observedEnvironments = []
  const mockRunner = successMockRunner()
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'claude',
    allowModel: false,
    runner: async options => {
      observedEnvironments.push(structuredClone(options.env))
      return mockRunner(options)
    },
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => ({
      operatingSystem: 'linux',
      platform: 'linux',
      arch: 'x64',
      executionEnvironment: 'devcontainer',
      pathClass: 'no-space',
      hostDigest: `sha256:${'6'.repeat(64)}`,
    }),
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    writeEvidence: false,
  })
  assert.equal(evidence.run.executionEnvironment, 'devcontainer')
  assert.ok(observedEnvironments.length > 0)
  assert.ok(observedEnvironments.every(environment => !Object.hasOwn(environment, 'USER')))

  for (const executionEnvironment of ['remote-host', 'github-hosted-runner']) {
    let processCalls = 0
    await assert.rejects(() => runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath: PROFILE_PATH,
      providerFilter: 'claude',
      allowModel: false,
      runner: async () => {
        processCalls += 1
        throw new Error('local provider process must remain unreachable')
      },
      gitIdentityResolver: () => IDENTITY,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => ({
        operatingSystem: executionEnvironment === 'remote-host' ? 'macos' : 'linux',
        platform: executionEnvironment === 'remote-host' ? 'darwin' : 'linux',
        arch: executionEnvironment === 'remote-host' ? 'arm64' : 'x64',
        executionEnvironment,
        pathClass: 'no-space',
        hostDigest: `sha256:${'7'.repeat(64)}`,
      }),
      runIdResolver: () => RUN_ID,
      clock: () => RUN_AT,
      writeEvidence: false,
    }), /executionEnvironment is unsupported/)
    assert.equal(processCalls, 0)
  }
})

test('default process runner ignores ambient PATH and credentials and rejects undeclared environment input', async () => {
  const attackerDirectory = mkdtempSync(resolve(tmpdir(), 'runtime-path-attacker-'))
  const isolatedFixture = mkdtempSync(resolve(tmpdir(), 'qijenchen-provider-conformance-env-'))
  const isolatedHome = resolve(isolatedFixture, '.provider-home')
  mkdirSync(isolatedHome, { recursive: true, mode: 0o700 })
  const previousPath = process.env.PATH
  const previousSecret = process.env.RUNTIME_CONFORMANCE_SECRET
  try {
    writeFileSync(resolve(attackerDirectory, 'sh'), '#!/bin/sh\nprintf attacker\n', { mode: 0o755 })
    process.env.PATH = attackerDirectory
    process.env.RUNTIME_CONFORMANCE_SECRET = 'must-not-cross-the-runner-boundary'

    const pathProbe = await defaultProcessRunner({
      command: 'sh',
      args: ['-c', 'printf safe'],
      cwd: REPO_ROOT,
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      metadata: { provider: 'codex', check: 'closed-path', driver: 'closed-path' },
    })
    assert.equal(pathProbe.exitCode, 0)
    assert.equal(pathProbe.stdout, 'safe')

    const environmentProbe = await defaultProcessRunner({
      command: process.execPath,
      args: ['--', PROVIDER_RUNTIME_PROBE, 'environment'],
      cwd: REPO_ROOT,
      timeoutMs: 5000,
      maxOutputBytes: 4096,
      metadata: { provider: 'codex', check: 'closed-environment', driver: 'closed-environment' },
    })
    assert.equal(environmentProbe.exitCode, 0)
    const observedEnvironment = JSON.parse(environmentProbe.stdout)
    // TMPDIR is part of the closed baseline (like PATH): env -i would otherwise strip it
    // and bounded probe children calling mktemp fall back to /tmp, which sandboxed hosts
    // may not allow. It is runner-derived, never caller-declared (not allowlisted).
    const expectedEnvironmentNames = ['FORCE_COLOR', 'NO_COLOR', 'PATH', 'TMPDIR']
    if (process.platform === 'darwin') expectedEnvironmentNames.push('__CF_USER_TEXT_ENCODING')
    assert.deepEqual(Object.keys(observedEnvironment).sort(), expectedEnvironmentNames.sort())
    assert.equal(
      observedEnvironment.TMPDIR,
      tmpdir(),
      'closed runner must carry one explicit runner-derived temp directory for bounded probe children',
    )
    if (process.platform === 'darwin') {
      assert.match(observedEnvironment.__CF_USER_TEXT_ENCODING, /^0x[0-9A-F]+:0x[0-9A-F]+:0x[0-9A-F]+$/)
    }
    assert.equal(observedEnvironment.RUNTIME_CONFORMANCE_SECRET, undefined)
    assert.notEqual(observedEnvironment.PATH, attackerDirectory)

    const homeProbe = await defaultProcessRunner({
      command: process.execPath,
      args: ['--', PROVIDER_RUNTIME_PROBE, 'home'],
      cwd: isolatedFixture,
      env: { HOME: isolatedHome },
      timeoutMs: 5000,
      maxOutputBytes: 4096,
      metadata: {
        provider: 'claude',
        check: 'isolated-home',
        driver: 'isolated-home',
        fixture: { root: isolatedFixture },
      },
    })
    assert.equal(homeProbe.exitCode, 0)
    assert.deepEqual(JSON.parse(homeProbe.stdout), { envHome: isolatedHome, osHome: isolatedHome })
    assert.notEqual(isolatedHome, process.env.HOME)

    chmodSync(isolatedHome, 0o755)
    assert.throws(() => defaultProcessRunner({
      command: process.execPath,
      args: ['--version'],
      cwd: isolatedFixture,
      env: { HOME: isolatedHome },
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      metadata: {
        provider: 'claude',
        check: 'insecure-home',
        driver: 'insecure-home',
        fixture: { root: isolatedFixture },
      },
    }), /HOME must be one private mode-0700 real directory/)
    chmodSync(isolatedHome, 0o700)

    const codexHome = resolve(isolatedFixture, '.codex-home')
    mkdirSync(codexHome, { mode: 0o755 })
    assert.throws(() => defaultProcessRunner({
      command: process.execPath,
      args: ['--version'],
      cwd: isolatedFixture,
      env: { CODEX_HOME: codexHome, HOME: isolatedHome },
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      metadata: {
        provider: 'codex',
        check: 'insecure-codex-home',
        driver: 'insecure-codex-home',
        fixture: { root: isolatedFixture },
      },
    }), /CODEX_HOME must be one private mode-0700 real directory/)

    assert.throws(() => defaultProcessRunner({
      command: process.execPath,
      args: ['--version'],
      cwd: REPO_ROOT,
      env: { ANTHROPIC_API_KEY: 'forbidden-test-secret' },
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      metadata: { provider: 'claude', check: 'closed-environment', driver: 'closed-environment' },
    }), /non-allowlisted names/)

    const currentAccount = operatingSystemUserInfo()
    assert.throws(() => defaultProcessRunner({
      command: process.execPath,
      args: ['--version'],
      cwd: REPO_ROOT,
      env: { HOME: currentAccount.homedir, USER: currentAccount.username },
      timeoutMs: 5000,
      maxOutputBytes: 1024,
      metadata: { provider: 'claude', check: 'forged-local-account', driver: 'version' },
    }), /USER is allowed only for one exact Claude local account invocation/)

    let forgedHostProviderInvocations = 0
    await assert.rejects(() => runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath: PROFILE_PATH,
      providerFilter: 'claude',
      allowModel: false,
      runner: defaultProcessRunner,
      gitIdentityResolver: () => IDENTITY,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => HOST,
      runIdResolver: () => RUN_ID,
      clock: () => RUN_AT,
      providerInvocationObserver: () => {
        forgedHostProviderInvocations += 1
      },
      writeEvidence: false,
    }), /requires the default host identity resolver and actual environment detector/)
    assert.equal(forgedHostProviderInvocations, 0)
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousSecret === undefined) delete process.env.RUNTIME_CONFORMANCE_SECRET
    else process.env.RUNTIME_CONFORMANCE_SECRET = previousSecret
    rmSync(attackerDirectory, { recursive: true, force: true })
    rmSync(isolatedFixture, { recursive: true, force: true })
  }
})

test('runtime and promotion Git identity use one absolute closed executable and ignore ambient config hooks', async () => {
  const attackerDirectory = mkdtempSync(resolve(tmpdir(), 'runtime-git-attacker-'))
  const fakeGit = resolve(attackerDirectory, 'git')
  const fakeGitMarker = `${fakeGit}.marker`
  const fakeMonitor = resolve(attackerDirectory, 'fsmonitor')
  const fakeMonitorMarker = `${fakeMonitor}.marker`
  const fakeFilter = resolve(attackerDirectory, 'filter')
  const fakeFilterMarker = `${fakeFilter}.marker`
  const poisonedGlobalConfig = resolve(attackerDirectory, 'poison.gitconfig')
  writeFileSync(
    fakeGit,
    '#!/bin/sh\nprintf \'fake-git:%s\\n\' "${RUNTIME_CONFORMANCE_SECRET-unset}" >> "$0.marker"\nexit 99\n',
    { mode: 0o755 },
  )
  writeFileSync(
    fakeMonitor,
    '#!/bin/sh\nprintf \'fake-monitor:%s\\n\' "${RUNTIME_CONFORMANCE_SECRET-unset}" >> "$0.marker"\nexit 99\n',
    { mode: 0o755 },
  )
  writeFileSync(
    fakeFilter,
    '#!/bin/sh\nprintf \'fake-filter:%s\\n\' "${RUNTIME_CONFORMANCE_SECRET-unset}" >> "$0.marker"\n/bin/cat\n',
    { mode: 0o755 },
  )
  writeFileSync(poisonedGlobalConfig, `[core]
\tfsmonitor = ${fakeMonitor}
\thooksPath = ${attackerDirectory}
[diff]
\texternal = ${fakeMonitor}
`)
  const maliciousRepositoryAlias = resolve(attackerDirectory, 'filter-repository')
  mkdirSync(maliciousRepositoryAlias)
  const maliciousRepository = realpathSync(maliciousRepositoryAlias)
  assert.equal(runClosedGit(['init', '--quiet'], { cwd: maliciousRepository, output: 'ignore' }).status, 0)
  assert.equal(runClosedGit(['config', '--local', 'filter.evil.clean', fakeFilter], { cwd: maliciousRepository, output: 'ignore' }).status, 0)
  writeFileSync(resolve(maliciousRepository, '.gitattributes'), 'tracked.txt filter=evil\n')
  writeFileSync(resolve(maliciousRepository, 'tracked.txt'), 'original\n')
  assert.equal(runClosedGit(['add', '.'], { cwd: maliciousRepository, output: 'ignore' }).status, 0)
  assert.equal(runClosedGit(
    ['commit', '--quiet', '-m', 'fixture'],
    {
      cwd: maliciousRepository,
      output: 'ignore',
      gitIdentity: {
        authorDate: '2026-01-01T00:00:00.000Z',
        authorEmail: 'runtime-fixture@example.invalid',
        authorName: 'Runtime Fixture',
        committerDate: '2026-01-01T00:00:00.000Z',
        committerEmail: 'runtime-fixture@example.invalid',
        committerName: 'Runtime Fixture',
      },
    },
  ).status, 0)
  rmSync(fakeFilterMarker, { force: true })
  writeFileSync(resolve(maliciousRepository, 'tracked.txt'), 'modified\n')
  const poisonedEnvironment = {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_GLOBAL: poisonedGlobalConfig,
    GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_CONFIG_VALUE_0: fakeMonitor,
    GIT_EXTERNAL_DIFF: fakeMonitor,
    HOME: attackerDirectory,
    PATH: attackerDirectory,
    RUNTIME_CONFORMANCE_SECRET: 'must-not-reach-git',
    XDG_CONFIG_HOME: attackerDirectory,
  }
  const previousEnvironment = new Map(
    Object.keys(poisonedEnvironment).map(name => [name, process.env[name]]),
  )
  try {
    Object.assign(process.env, poisonedEnvironment)

    const runtimeIdentity = resolveGitIdentity(REPO_ROOT)
    assert.match(runtimeIdentity.gitHead, /^[a-f0-9]{40}$/)
    assert.match(runtimeIdentity.gitTree, /^[a-f0-9]{40}$/)
    assert.equal(typeof runtimeIdentity.worktreeDirty, 'boolean')

    const promotionIdentity = currentRuntimeCertificationIdentity(REPO_ROOT)
    assert.equal(promotionIdentity.gitCommit, runtimeIdentity.gitHead)
    assert.equal(promotionIdentity.gitTree, runtimeIdentity.gitTree)
    const parentResult = runClosedGit(['rev-parse', 'HEAD^'], { cwd: REPO_ROOT })
    assert.equal(parentResult.status, 0)
    const parentCommit = parentResult.stdout.trim()
    assert.match(parentCommit, /^[a-f0-9]{40}$/)
    const repositoryIdentity = resolveLocalRepositoryIdentity({
      repoRoot: REPO_ROOT,
      repository: {
        id: 'closed-git-authority-fixture',
        github: 'fixture/closed-git-authority-fixture',
        role: 'authority',
        defaultBranch: 'main',
      },
      subjectCommits: [parentCommit],
      carrierPolicy: {
        relationship: 'ledger-carrier-descendant',
        allowedChangedPaths: ['**'],
      },
    })
    assert.equal(repositoryIdentity.gitCommit, runtimeIdentity.gitHead)
    assert.equal(repositoryIdentity.subjectProofs[parentCommit].relationship, 'ancestor')
    assert.ok(repositoryIdentity.subjectProofs[parentCommit].changedFiles.length > 0)

    const deepAuditSnapshot = captureDeepAuditSnapshot(REPO_ROOT)
    assert.equal(deepAuditSnapshot.head, runtimeIdentity.gitHead)
    assert.equal(deepAuditSnapshot.tree, runtimeIdentity.gitTree)

    assert.throws(() => promoteRuntimeEvidence({
      source: resolve(attackerDirectory, 'missing-staging-evidence.json'),
      outputDirectory: resolve(attackerDirectory, 'promotion-output'),
      repoRoot: REPO_ROOT,
      expectedScope: 'provider',
    }), /Runtime staging evidence must be a regular non-symlink file/)

    let providerProcessCalls = 0
    await assert.rejects(() => runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath: PROFILE_PATH,
      providerFilter: 'codex',
      allowModel: false,
      runner: async () => {
        providerProcessCalls += 1
        throw new Error('provider process must remain unreachable')
      },
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: async () => {
        throw new Error('fixture closed certification unavailable')
      },
      hostIdentityResolver: () => HOST,
      writeEvidence: false,
    }), /fixture closed certification unavailable/)
    assert.equal(providerProcessCalls, 0)
    assert.equal(existsSync(fakeGitMarker), false, 'ambient PATH git must never execute')
    assert.equal(existsSync(fakeMonitorMarker), false, 'ambient global fsmonitor/external diff must never execute')
    assert.throws(
      () => resolveGitIdentity(maliciousRepository),
      /Runtime Git local configuration may execute unsupported external commands: filter\.evil\.clean/,
    )
    assert.equal(existsSync(fakeFilterMarker), false, 'repo-local clean filters must be rejected before worktree inspection')

    assert.throws(
      () => resolveClosedGitExecutable('win32'),
      /Closed Git execution is unsupported on platform win32/,
    )
    assert.throws(
      () => validateClosedGitExecutable(resolve(attackerDirectory, 'absent-git')),
      /Closed Git executable is unavailable/,
    )
    assert.throws(
      () => resolveGitIdentity(attackerDirectory),
      /Cannot resolve runtime Git worktree root through closed Git/,
    )
  } finally {
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(attackerDirectory, { recursive: true, force: true })
  }
})

test('provider certification failure or capability substitution blocks every provider process before spawn', async () => {
  const baseOptions = {
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'codex',
    allowModel: false,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    hostIdentityResolver: () => HOST,
    writeEvidence: false,
  }
  for (const runtimeCertificationResolver of [
    async () => { throw new Error('fixture certification unavailable') },
    async options => ({ ...certificationIdentity(options), command: resolve(tmpdir(), 'ambient-codex') }),
    async options => ({ ...certificationIdentity(options), argsPrefix: [resolve(options.rootPath, 'node_modules/.bin/not-codex')] }),
    async options => ({ ...certificationIdentity(options), target: resolve(options.rootPath, 'node_modules/.provider-cli-toolchain/substituted-target') }),
  ]) {
    let processCalls = 0
    await assert.rejects(() => runRuntimeConformance({
      ...baseOptions,
      runtimeCertificationResolver,
      runner: async () => {
        processCalls += 1
        throw new Error('provider process must remain unreachable')
      },
    }), /fixture certification unavailable|does not execute the exact repository shim/)
    assert.equal(processCalls, 0)
  }
})

test('production runner isolates Claude version and limits local-account access to entitlement without model authorization', async () => {
  const providerInvocations = []
  const options = {
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'claude',
    allowModel: false,
    runner: defaultProcessRunner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    providerInvocationObserver: ({ args }) => {
      providerInvocations.push(args)
    },
    writeEvidence: false,
  }
  const accountHome = operatingSystemUserInfo().homedir
  // Headless CI and remote hosts (github-hosted-runner / remote-host / cloud-hosted) are a
  // recognized-but-rejected class for local conformance probes: with the production runner
  // the default host identity resolver is mandatory, and runRuntimeConformance validates
  // that ambient host identity before any subject or local-account resolution, so on such
  // hosts the run must fail closed with the unsupported-environment error and zero provider
  // invocations. That is the exact invariant the dedicated "remote or CI hosts fail before
  // local execution" test asserts; classifying GitHub runners as a supported local class
  // would weaken that lane, so this ambient-detection test accepts the earlier fail-closed
  // rejection and only exercises the HOME-mismatch and full local paths on supported hosts.
  if (!['native', 'wsl2', 'devcontainer'].includes(detectExecutionEnvironment(process.platform, process.env))) {
    await assert.rejects(
      () => runRuntimeConformance(options),
      /Runtime conformance host environment executionEnvironment is unsupported/,
    )
    assert.deepEqual(
      providerInvocations,
      [],
      'Unsupported host classes must fail before invoking the local Claude account',
    )
    return
  }
  if (
    process.env.GOVERNANCE_HARNESS_MODE === 'offline-local-only'
    && resolve(process.env.HOME ?? '') !== resolve(accountHome)
  ) {
    await assert.rejects(
      () => runRuntimeConformance(options),
      /Ambient HOME differs from the operating-system account home/,
    )
    assert.deepEqual(
      providerInvocations,
      [],
      'The offline isolated Harness must fail before invoking the local Claude account',
    )
    return
  }
  const { evidence } = await runRuntimeConformance(options)

  assert.deepEqual(providerInvocations, [
    ['--version'],
    ['auth', 'status', '--json'],
  ])
  assert.equal(evidence.status, 'fail')
  assert.deepEqual(evidence.providers[0].tool.command.environmentNames, ['HOME'])
  const entitlementCheck = evidence.providers[0].checks.find(check => check.driver === 'claude-entitlement-readback')
  assert.equal(entitlementCheck.certificationImpact, 'capability-only')
  assert.equal(entitlementCheck.command.cwd, '<fixture>')
  assert.deepEqual(entitlementCheck.command.environmentNames, ['HOME', 'USER'])
  const modelChecks = evidence.providers[0].checks.filter(check =>
    check.driver.startsWith('claude-') && check.driver !== 'claude-entitlement-readback')
  assert.ok(modelChecks.length > 0)
  assert.ok(modelChecks.every(check =>
    check.status === 'fail'
      && check.result.assertions.some(assertion =>
        assertion.id === 'explicit-model-execution-authorized' && assertion.pass === false)))
  assert.equal(evidence.safety.temporaryCredentialHandling, 'claude-local-account-reference-bounded-probes-v1')
})

test('custom runtime seams cannot write production evidence', async () => {
  const baseOptions = {
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'codex',
    allowModel: false,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    hostIdentityResolver: () => HOST,
    writeEvidence: true,
  }
  await assert.rejects(() => runRuntimeConformance({
    ...baseOptions,
    runner: successMockRunner(),
  }), /Custom runtime process runners are allowed only for non-writing tests/)
  await assert.rejects(() => runRuntimeConformance({
    ...baseOptions,
    runtimeCertificationResolver: certificationIdentity,
  }), /Custom runtime certification resolvers are allowed only for non-writing tests/)
  await assert.rejects(() => runRuntimeConformance({
    ...baseOptions,
    providerInvocationObserver: () => {},
  }), /invocation observers are allowed only for non-writing tests/)
  await assert.rejects(() => runRuntimeConformance(baseOptions), /identity, clock, or Harness resolvers are allowed only for non-writing tests/)
})

test('model execution and credential copying require allowModel to be exactly boolean true', async () => {
  for (const allowModel of [1, 'true', null, {}, []]) {
    let processCalls = 0
    await assert.rejects(() => runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath: PROFILE_PATH,
      providerFilter: 'codex',
      allowModel,
      runner: async () => {
        processCalls += 1
        throw new Error('invalid allowModel must fail before any provider process')
      },
      gitIdentityResolver: () => IDENTITY,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => HOST,
      runIdResolver: () => RUN_ID,
      clock: () => RUN_AT,
      writeEvidence: false,
    }), /allowModel must be an explicit boolean/)
    assert.equal(processCalls, 0)
  }
})

test('runtime conformance final CAS rejects Git, contract, and Harness drift across long probes', async () => {
  let gitCalls = 0
  await assert.rejects(
    () => mockedRun({
      gitIdentityResolver: () => {
        gitCalls += 1
        return gitCalls === 1 ? IDENTITY : { ...IDENTITY, worktreeDirty: !IDENTITY.worktreeDirty }
      },
    }),
    /subject changed during provider probes: worktreeDirty/,
  )
  assert.equal(gitCalls, 2)

  let contractCalls = 0
  await assert.rejects(
    () => mockedRun({
      contractIdentityResolver: async () => {
        contractCalls += 1
        return contractCalls === 1
          ? CONTRACT
          : { ...CONTRACT, contractDigest: `sha256:${'9'.repeat(64)}` }
      },
    }),
    /subject changed during provider probes: contractDigest/,
  )
  assert.equal(contractCalls, 2)

  const canonicalHarnessPaths = runtimeHarnessPaths(PROFILE_PATH)
  let harnessCalls = 0
  await assert.rejects(
    () => mockedRun({
      harnessPathsResolver: () => {
        harnessCalls += 1
        return harnessCalls === 1
          ? canonicalHarnessPaths
          : canonicalHarnessPaths.slice(0, -1)
      },
    }),
    /subject changed during provider probes: harnessDigest/,
  )
  assert.equal(harnessCalls, 2)
})

test('timeouts and output overflow are explicit failing evidence, and the default runner terminates bounded probes', async () => {
  for (const override of [{ timedOut: true }, { outputExceeded: true }]) {
    const { evidence } = await mockedRun({ overrides: { 'provider-hook-runner-pass': override } })
    assert.equal(evidence.status, 'fail')
    for (const provider of evidence.providers) {
      const check = provider.checks.find(candidate => candidate.driver === 'provider-hook-runner-pass')
      assert.equal(check.status, 'fail')
      assert.equal(
        check.result.assertions.find(assertion => assertion.id === (
          override.timedOut ? 'process-did-not-time-out' : 'provider-output-limit-not-exceeded'
        )).pass,
        false,
      )
    }
  }

  const versionTimeout = await mockedRun({ overrides: { version: { timedOut: true } } })
  assert.equal(validateRuntimeEvidence(versionTimeout.evidence), true)
  assert.equal(versionTimeout.evidence.status, 'fail')
  assert.ok(versionTimeout.evidence.providers.every(provider =>
    provider.tool.status === 'fail'
      && provider.tool.version === null
      && provider.tool.distribution.distributionVersion !== null))

  for (const field of ['timedOut', 'outputExceeded']) {
    const contradictory = structuredClone((await mockedRun()).evidence)
    const check = contradictory.providers[0].checks[0]
    check.result[field] = true
    redigestEvidence(contradictory)
    assert.throws(
      () => validateRuntimeEvidence(contradictory),
      field === 'timedOut'
        ? /timeout assertion disagrees with the process result/
        : /output-limit assertion disagrees with the process result/,
      `signed-shape evidence cannot claim ${field}=true while retaining passing semantic assertions`,
    )
  }

  const timedOut = await defaultProcessRunner({
    command: process.execPath,
    args: ['--', PROVIDER_RUNTIME_PROBE, 'hang'],
    cwd: REPO_ROOT,
    timeoutMs: 25,
    maxOutputBytes: 1024,
    metadata: { provider: 'codex', check: 'timeout', driver: 'timeout' },
  })
  assert.equal(timedOut.timedOut, true)

  const processTreeStartedAt = Date.now()
  const processTreeTimeout = await defaultProcessRunner({
    command: process.execPath,
    args: ['--', PROVIDER_RUNTIME_PROCESS_TREE_PARENT],
    cwd: REPO_ROOT,
    timeoutMs: 25,
    maxOutputBytes: 1024,
    metadata: { provider: 'codex', check: 'process-tree-timeout', driver: 'process-tree-timeout' },
  })
  assert.equal(processTreeTimeout.timedOut, true)
  assert.ok(Date.now() - processTreeStartedAt < 3000, 'timeout must terminate the complete provider process group')

  const overflow = await defaultProcessRunner({
    command: process.execPath,
    args: ['--', PROVIDER_RUNTIME_PROBE, 'overflow'],
    cwd: REPO_ROOT,
    timeoutMs: 5000,
    maxOutputBytes: 32,
    metadata: { provider: 'codex', check: 'output-limit', driver: 'output-limit' },
  })
  assert.equal(overflow.outputExceeded, true)
})

test('runtime conformance executes the unified runner against real canonical hooks for both providers', async () => {
  const mockRunner = successMockRunner()
  const runner = async options => options.metadata.driver.startsWith('provider-hook-runner-')
    ? defaultProcessRunner(options)
    : mockRunner(options)
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'all',
    allowModel: true,
    runner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => HOST,
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    writeEvidence: false,
  })

  assert.equal(evidence.status, 'pass', stableStringify(evidence.providers.map(provider => ({
    id: provider.id,
    failedChecks: provider.checks.filter(check => check.status === 'fail').map(check => ({ id: check.id, driver: check.driver, assertions: check.result.assertions })),
  })), 0))
  for (const provider of evidence.providers) {
    const runnerChecks = provider.checks.filter(check => check.driver.startsWith('provider-hook-runner-'))
    assert.deepEqual(runnerChecks.map(check => check.driver).sort(), [
      'provider-hook-runner-block',
      'provider-hook-runner-context',
      'provider-hook-runner-pass',
      'provider-hook-runner-stop',
    ])
    assert.ok(runnerChecks.every(check => check.status === 'pass'))
  }
})

test('missing context-fork evidence and a permissive hook adapter fail closed', async () => {
  const missingFork = await mockedRun({
    overrides: {
      'claude-context-fork': { stdout: JSON.stringify({ parent_tool_use_id: 'fixture-fork', text: 'no sentinels' }) },
    },
  })
  assert.equal(missingFork.evidence.status, 'fail')
  const forkCheck = missingFork.evidence.providers.find(provider => provider.id === 'claude').checks
    .find(check => check.driver === 'claude-context-fork')
  assert.equal(forkCheck.status, 'fail')
  assert.equal(forkCheck.result.assertions.find(item => item.id === 'context-fork-agent-adapter-observed').pass, false)

  const permissiveAdapter = await mockedRun({
    overrides: {
      'generated-provider-adapter-block': { exitCode: 0, stderr: '' },
    },
  })
  assert.equal(permissiveAdapter.evidence.status, 'fail')
  assert.ok(permissiveAdapter.evidence.providers.every(provider => provider.status === 'fail'))
})

test('Claude decision-authority routing is required and fails closed on route or probe substitution', async () => {
  const wrongRouting = await mockedRun({
    overrides: {
      'claude-authority-routing': {
        stdout: JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          structured_output: {
            publicProjectInstructionEvidence: 'substituted-instruction',
            engineering: 'ASK',
            git: 'AUTO',
            pullRequest: 'AUTO',
            ci: 'AUTO',
            release: 'AUTO',
            approvedVisualBaseline: 'ASK',
            unresolvedUiUxSsot: 'AUTO',
            login: 'ASK',
            mfa: 'HUMAN_ONLY',
            oauth: 'HUMAN_ONLY',
            ownerAction: 'AUTO',
            billing: 'AUTO',
            missingCredentialReference: 'ASK',
          },
        }),
      },
    },
  })
  const claude = wrongRouting.evidence.providers.find(provider => provider.id === 'claude')
  const check = claude.checks.find(candidate => candidate.id === 'decision-authority-routing')
  const assertions = new Map(check.result.assertions.map(item => [item.id, item.pass]))
  assert.equal(check.driver, 'claude-authority-routing')
  assert.equal(check.certificationImpact, 'required')
  assert.equal(check.status, 'fail')
  assert.equal(claude.status, 'fail')
  assert.equal(wrongRouting.evidence.status, 'fail')
  assert.equal(assertions.get('canonical-authority-public-project-instruction-evidence-observed'), false)
  assert.equal(assertions.get('authority-routing-engineering-auto'), false)
  assert.equal(assertions.get('authority-routing-approved-visual-baseline-auto'), false)
  assert.equal(assertions.get('authority-routing-unresolved-ui-ux-ssot-ask'), false)
  assert.equal(assertions.get('authority-routing-login-human-only'), false)
  assert.equal(assertions.get('authority-routing-owner-action-human-only'), false)
  assert.equal(assertions.get('authority-routing-billing-human-only'), false)
  assert.equal(assertions.get('authority-routing-missing-credential-reference-human-only'), false)

  const substitutedProbe = structuredClone(wrongRouting.evidence)
  const substitutedCheck = substitutedProbe.providers.find(provider => provider.id === 'claude')
    .checks.find(candidate => candidate.id === 'decision-authority-routing')
  substitutedCheck.command.arguments[substitutedCheck.command.arguments.length - 1] = 'Classify a different authority policy.'
  redigestEvidence(substitutedProbe)
  assert.throws(
    () => validateRuntimeEvidence(substitutedProbe),
    /does not bind the exact isolated Claude authority-routing probe/,
  )
})

test('unified runner semantic probes reject noise, permissive blocks, and untranslated envelopes', async () => {
  for (const [driver, override] of Object.entries({
    'provider-hook-runner-pass': { stdout: 'unexpected output\n' },
    'provider-hook-runner-block': { exitCode: 0, stderr: '' },
    'provider-hook-runner-context': { stdout: JSON.stringify({ governanceContext: { hookEventName: 'SessionStart', message: 'untranslated' } }) },
    'provider-hook-runner-stop': { stdout: JSON.stringify({ governanceDecision: 'block', reason: 'untranslated' }) },
  })) {
    const { evidence } = await mockedRun({ overrides: { [driver]: override } })
    assert.equal(evidence.status, 'fail', `${driver} must fail closed`)
    assert.ok(evidence.providers.every(provider => provider.checks.find(check => check.driver === driver).status === 'fail'))
  }
})

test('Claude model-backed probes require an explicit opt-in and are never silently treated as tested', async () => {
  const invoked = []
  const runner = async options => {
    invoked.push(options.metadata.driver)
    return successMockRunner()(options)
  }
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'claude',
    allowModel: false,
    runner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    // Explicit host fixture: this test verifies the model-execution opt-in gate, not
    // ambient host classification. Ambient detection correctly fails closed on headless
    // CI (github-hosted-runner), which would mask the gating assertions under test.
    hostIdentityResolver: () => HOST,
    writeEvidence: false,
  })

  assert.equal(evidence.status, 'fail')
  assert.equal(evidence.scope, 'provider')
  assert.deepEqual(invoked.sort(), [
    'claude-entitlement-readback',
    'generated-provider-adapter-block',
    'provider-hook-runner-block',
    'provider-hook-runner-context',
    'provider-hook-runner-pass',
    'provider-hook-runner-stop',
    'version',
  ])
  const modelChecks = evidence.providers[0].checks.filter(check => (
    ['claude-authority-routing', 'claude-context-fork', 'claude-native-block'].includes(check.driver)
  ))
  assert.ok(modelChecks.every(check => check.result.assertions.some(item => item.id === 'explicit-model-execution-authorized' && !item.pass)))
  const profile = readJson(PROFILE_PATH)
  const claude = profile.providers.find(provider => provider.id === 'claude')
  const capabilityChecks = evidence.providers[0].checks.filter(
    check => check.driver === 'claude-review-capability-probe',
  )
  assert.ok(capabilityChecks.length > 0)
  for (const capabilityCheck of capabilityChecks) {
    const profileCheck = claude.checks.find(check => check.id === capabilityCheck.id)
    const planned = prepareClaudeReviewCapabilityProbe({
      repoRoot: REPO_ROOT,
      provider: claude,
      check: profileCheck,
      environmentNames: ['HOME'],
    })
    assert.deepEqual(capabilityCheck.command, planned.command)
    assert.equal(planned.arguments.includes('--max-budget-usd'), false)
    assert.equal(planned.arguments.includes('--fallback-model'), false)
    assert.equal(planned.arguments[planned.arguments.indexOf('--effort') + 1], 'max')
    assert.equal(planned.arguments[planned.arguments.indexOf('--tools') + 1], '')
  }
})

test('Codex native hook lifecycle probe also requires explicit model execution', async () => {
  const invoked = []
  const runner = async options => {
    invoked.push(options.metadata.driver)
    return successMockRunner()(options)
  }
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'codex',
    allowModel: false,
    runner,
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    // Explicit host fixture for the same reason as the Claude opt-in test above:
    // ambient detection fails closed on headless CI and would mask the gate under test.
    hostIdentityResolver: () => HOST,
    writeEvidence: false,
  })

  assert.equal(evidence.status, 'fail')
  assert.equal(evidence.scope, 'provider')
  assert.deepEqual(invoked.sort(), [
    'codex-debug-discovery',
    'generated-provider-adapter-block',
    'provider-hook-runner-block',
    'provider-hook-runner-context',
    'provider-hook-runner-pass',
    'provider-hook-runner-stop',
    'version',
  ])
  const lifecycle = evidence.providers[0].checks.find(check => check.driver === 'codex-native-hook-lifecycle')
  assert.equal(lifecycle.status, 'fail')
  assert.ok(lifecycle.result.assertions.some(item => item.id === 'explicit-model-execution-authorized' && !item.pass))
})

test('invalid contract identity blocks a passing runtime result from becoming passing evidence', async () => {
  const { evidence } = await mockedRun({ contract: { ...CONTRACT, valid: false, blockingDiagnosticIds: ['GOV-CONTRACT-001'] } })
  assert.equal(evidence.status, 'fail')
  assert.ok(evidence.providers.every(provider => provider.status === 'pass'))
})

test('provider evidence is explicitly scoped and cannot be relabelled as local or external fleet evidence', async () => {
  const { evidence } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'codex',
    allowModel: true,
    runner: successMockRunner(),
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    runtimeCertificationResolver: certificationIdentity,
    hostIdentityResolver: () => HOST,
    runIdResolver: () => RUN_ID,
    clock: () => RUN_AT,
    writeEvidence: false,
  })
  assert.equal(evidence.status, 'pass')
  assert.equal(evidence.scope, 'provider')
  assert.deepEqual(evidence.providers.map(provider => provider.id), ['codex'])
  assert.equal(validateRuntimeEvidence(evidence), true)

  const forgedLocalFleet = structuredClone(evidence)
  forgedLocalFleet.scope = 'local-fleet'
  assert.throws(() => validateRuntimeEvidence(forgedLocalFleet), /must exactly cover the active local-probe provider fleet/)

  const forgedExternalFleetClaim = structuredClone(evidence)
  forgedExternalFleetClaim.scope = 'fleet'
  assert.throws(() => validateRuntimeEvidence(forgedExternalFleetClaim), /scope is invalid/)

  const forgedProvider = structuredClone((await mockedRun()).evidence)
  forgedProvider.scope = 'provider'
  assert.throws(() => validateRuntimeEvidence(forgedProvider), /must contain exactly one provider/)
})

test('capability-only checks cannot fail or pass the base runtime certification status', async () => {
  const { evidence } = await mockedRun({
    overrides: {
      'claude-entitlement-readback': {
        exitCode: 1,
        stdout: '{}',
      },
    },
  })
  const claude = evidence.providers.find(provider => provider.id === 'claude')
  const entitlement = claude.checks.find(check => check.id === 'subscription-entitlement-readback')
  assert.equal(entitlement.certificationImpact, 'capability-only')
  assert.equal(entitlement.status, 'fail')
  assert.equal(claude.status, 'pass')
  assert.equal(evidence.status, 'pass')
  assert.equal(requiredRuntimeChecksPass(claude.checks), true)
  assert.equal(validateRuntimeEvidence(evidence), true)

  const forgedRequired = structuredClone(evidence)
  forgedRequired.providers.find(provider => provider.id === 'claude')
    .checks.find(check => check.id === 'subscription-entitlement-readback')
    .certificationImpact = 'required'
  redigestEvidence(forgedRequired)
  assert.throws(
    () => validateRuntimeEvidence(forgedRequired),
    /status disagrees with its required checks/,
  )
})

test('runtime platform target bindings reject substituted, missing, wrong-path, wrong-version, and native Windows evidence', async () => {
  const profile = readJson(PROFILE_PATH)
  const { evidence } = await mockedRun()

  const platformSubstitution = structuredClone(evidence)
  platformSubstitution.run.platform = 'linux'
  redigestEvidence(platformSubstitution)
  assert.throws(() => validateRuntimeEvidence(platformSubstitution), /OS\/platform\/executionEnvironment combination is unsupported/)

  const missingAxis = structuredClone(evidence)
  delete missingAxis.run.executionEnvironment
  redigestEvidence(missingAxis)
  assert.throws(() => validateRuntimeEvidence(missingAxis), /run identity has an invalid or open shape/)

  const wrongPathClass = structuredClone(evidence)
  wrongPathClass.run.pathClass = 'contains-space'
  redigestEvidence(wrongPathClass)
  assert.throws(() => validateRuntimeEvidenceProfileBinding(wrongPathClass, profile), /platform target mismatch/)

  const wrongVersion = structuredClone(evidence)
  const codex = wrongVersion.providers.find(provider => provider.id === 'codex')
  codex.tool.version = 'codex-cli 9.9.9'
  codex.tool.distribution.distributionVersion = '9.9.9'
  redigestEvidence(wrongVersion)
  assert.throws(() => validateRuntimeEvidenceProfileBinding(wrongVersion, profile), /distribution version differs from the active profile target/)

  const wrongTarget = structuredClone(evidence)
  wrongTarget.providers[0].targetBinding.digest = `sha256:${'f'.repeat(64)}`
  redigestEvidence(wrongTarget)
  assert.throws(() => validateRuntimeEvidenceProfileBinding(wrongTarget, profile), /target digest mismatch/)

  await assert.rejects(() => runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: PROFILE_PATH,
    providerFilter: 'codex',
    allowModel: false,
    runner: successMockRunner(),
    gitIdentityResolver: () => IDENTITY,
    contractIdentityResolver: async () => CONTRACT,
    hostIdentityResolver: () => ({
      operatingSystem: 'windows', platform: 'win32', arch: 'x64', executionEnvironment: 'native', pathClass: 'contains-space',
      hostDigest: `sha256:${'5'.repeat(64)}`,
    }),
    writeEvidence: false,
  }), /operatingSystem is unsupported/)
})

test('certification runtime evidence must exactly cover the active profile check ids and drivers', async () => {
  const profile = readJson(PROFILE_PATH)
  const { evidence } = await mockedRun()
  for (const profileProvider of profile.providers.filter(provider => provider.executionMode === 'local-probe')) {
    const evidenceProvider = evidence.providers.find(provider => provider.id === profileProvider.id)
    assert.equal(validateRuntimeCheckCoverage(profileProvider, evidenceProvider, profileProvider.id), true)

    const missing = structuredClone(evidenceProvider)
    missing.checks.pop()
    assert.throws(() => validateRuntimeCheckCoverage(profileProvider, missing, profileProvider.id), /check coverage differs/)

    const extra = structuredClone(evidenceProvider)
    extra.checks.push({ ...structuredClone(extra.checks[0]), id: 'unregistered-runtime-check' })
    assert.throws(() => validateRuntimeCheckCoverage(profileProvider, extra, profileProvider.id), /check coverage differs/)

    const drifted = structuredClone(evidenceProvider)
    drifted.checks[0].driver = 'provider-hook-runner-pass'
    assert.throws(() => validateRuntimeCheckCoverage(profileProvider, drifted, profileProvider.id), /check coverage differs/)

    const impactDrifted = structuredClone(evidenceProvider)
    impactDrifted.checks[0].certificationImpact = impactDrifted.checks[0].certificationImpact === 'required'
      ? 'capability-only'
      : 'required'
    assert.throws(() => validateRuntimeCheckCoverage(profileProvider, impactDrifted, profileProvider.id), /check coverage differs/)

    const duplicate = structuredClone(evidenceProvider)
    duplicate.checks[1].id = duplicate.checks[0].id
    assert.throws(() => validateRuntimeCheckCoverage(profileProvider, duplicate, profileProvider.id), /duplicate check id/)

    const duplicateDriver = structuredClone(evidence)
    const duplicateDriverProvider = duplicateDriver.providers.find(provider => provider.id === profileProvider.id)
    duplicateDriverProvider.checks[1].driver = duplicateDriverProvider.checks[0].driver
    redigestEvidence(duplicateDriver)
    assert.throws(() => validateRuntimeEvidence(duplicateDriver), /duplicate or invalid check driver/)
  }
})

test('profile validation is provider/driver aware and rejects arbitrary executable paths', () => {
  const profile = readJson(PROFILE_PATH)
  assert.equal(validateRuntimeProfile(profile), true)

  const arbitraryDriver = structuredClone(profile)
  arbitraryDriver.providers[0].checks[0].driver = 'run-any-shell-command'
  assert.throws(() => validateRuntimeProfile(arbitraryDriver), /Unknown runtime conformance driver/)

  const pathExecutable = structuredClone(profile)
  pathExecutable.providers[0].executable = '/tmp/claude'
  assert.throws(() => validateRuntimeProfile(pathExecutable), /bare command name/)

  const crossedDriver = structuredClone(profile)
  crossedDriver.providers[1].checks[0].driver = 'claude-context-fork'
  crossedDriver.providers[1].checks[0].requiresModel = true
  assert.throws(() => validateRuntimeProfile(crossedDriver), /only be assigned to claude/)

  const hiddenModelCall = structuredClone(profile)
  hiddenModelCall.providers[0].checks.find(check => check.requiresModel).requiresModel = false
  assert.throws(() => validateRuntimeProfile(hiddenModelCall), /unsafe requiresModel declaration/)

  const duplicateDriver = structuredClone(profile)
  duplicateDriver.providers[0].checks[1].driver = duplicateDriver.providers[0].checks[0].driver
  duplicateDriver.providers[0].checks[1].requiresModel = duplicateDriver.providers[0].checks[0].requiresModel
  delete duplicateDriver.providers[0].checks[1].reviewProfileId
  assert.throws(() => validateRuntimeProfile(duplicateDriver), /Duplicate runtime check driver/)

  const invalidCertificationImpact = structuredClone(profile)
  invalidCertificationImpact.providers[0].checks[0].certificationImpact = 'advisory'
  assert.throws(() => validateRuntimeProfile(invalidCertificationImpact), /certificationImpact is invalid/)

  const optionalAuthorityRouting = structuredClone(profile)
  optionalAuthorityRouting.providers[0].checks.find(check => check.driver === 'claude-authority-routing')
    .certificationImpact = 'capability-only'
  assert.throws(
    () => validateRuntimeProfile(optionalAuthorityRouting),
    /must remain the required decision-authority-routing check/,
  )

  const missingAuthorityRouting = structuredClone(profile)
  const missingRuntimeClaude = missingAuthorityRouting.providers.find(provider => provider.id === 'claude')
  missingRuntimeClaude.checks = missingRuntimeClaude.checks
    .filter(check => check.driver !== 'claude-authority-routing')
  assert.throws(
    () => validateRuntimeProfile(missingAuthorityRouting),
    /must contain exactly one required decision-authority-routing\/claude-authority-routing check/,
  )

  const duplicateAuthorityRouting = structuredClone(profile)
  const duplicateRuntimeClaude = duplicateAuthorityRouting.providers.find(provider => provider.id === 'claude')
  duplicateRuntimeClaude.checks.push(structuredClone(
    duplicateRuntimeClaude.checks.find(check => check.driver === 'claude-authority-routing'),
  ))
  assert.throws(
    () => validateRuntimeProfile(duplicateAuthorityRouting),
    /Duplicate runtime check/,
  )

  const noRequiredCertificationCheck = structuredClone(profile)
  for (const check of noRequiredCertificationCheck.providers.find(provider => provider.id === 'codex').checks) {
    check.certificationImpact = 'capability-only'
  }
  assert.throws(() => validateRuntimeProfile(noRequiredCertificationCheck), /at least one required certification check/)

  const missingPlatformAxis = structuredClone(profile)
  delete missingPlatformAxis.providers[0].certificationTargets[0].pathClass
  assert.throws(() => validateRuntimeProfile(missingPlatformAxis), /certification target has an invalid or open shape/)

  const nativeWindows = structuredClone(profile)
  Object.assign(nativeWindows.providers[0].certificationTargets[0], {
    operatingSystem: 'windows', platform: 'win32', arch: 'x64', executionEnvironment: 'native',
  })
  assert.throws(() => validateRuntimeProfile(nativeWindows), /operatingSystem is unsupported/)

  const adapterRegistry = readJson(resolve(REPO_ROOT, 'packages/governance/canonical/providers.json'))
  const futureRegistry = structuredClone(adapterRegistry)
  const futureAdapter = structuredClone(futureRegistry.providers.find((provider) => provider.id === 'codex'))
  futureAdapter.id = 'future-runtime'
  futureRegistry.providers.push(futureAdapter)
  assert.throws(
    () => validateRuntimeProfile(profile, { adapterRegistry: futureRegistry }),
    /adapter coverage must exactly equal registered concrete runtimes/,
  )
  const futureProfile = structuredClone(profile)
  futureProfile.providers.push({
    id: 'future-runtime',
    adapterProviderId: 'future-runtime',
    runtimeKind: 'future-runtime-cli',
    certificationSurface: 'local',
    executionMode: 'local-probe',
    evidenceKind: 'provider-runtime-conformance',
    surfacePolicy: { kind: 'local-probe' },
    executable: 'future-runtime',
    distributionVersionAuthority: { kind: 'profile-external-certification', version: '1.0.0' },
    versionArguments: ['--version'],
    certificationTargets: [{
      id: 'macos-darwin-arm64-native-no-space',
      operatingSystem: 'macos',
      platform: 'darwin',
      arch: 'arm64',
      executionEnvironment: 'native',
      distributionVersion: '1.0.0',
      pathClass: 'no-space',
    }],
    checks: [{ id: 'provider-adapter-block', driver: 'provider-hook-adapter', requiresModel: false }],
  })
  assert.equal(validateRuntimeProfile(futureProfile, { adapterRegistry: futureRegistry }), true)

  const driftedProjection = structuredClone(profile)
  driftedProjection.providers[0].certificationTargets[0].distributionVersion = '9.9.9'
  assert.throws(() => validateRuntimeProfile(driftedProjection), /distributionVersion differs from its canonical authority/)

  const poisonedToolchain = readJson(resolve(GOVERNANCE_ROOT, 'providers/provider-cli-toolchain.json'))
  poisonedToolchain.tools.find(tool => tool.providerId === 'codex').version = '9.9.9'
  assert.throws(
    () => validateRuntimeProfile(profile, { toolchainManifest: poisonedToolchain }),
    /distributionVersion differs from its canonical authority/,
  )
})

test('redaction removes secret-shaped output and local paths before any version text can enter evidence', () => {
  const secret = 'github_pat_SUPERSECRET123456'
  const value = redactText(`token=${secret} repo=${REPO_ROOT} home=/Users/example`, {
    repoRoot: REPO_ROOT,
    fixtureRoot: '/private/tmp/qijenchen-provider-conformance-123',
    env: { HOME: '/Users/example', RUNTIME_TEST_TOKEN: secret },
  })
  assert.equal(value.includes(secret), false)
  assert.equal(value.includes(REPO_ROOT), false)
  assert.equal(value.includes('/Users/example'), false)
  assert.match(value, /<redacted>/)
  assert.match(value, /<repo>/)
  assert.match(value, /<home>/)
})

test('one canonical runtime harness identity covers every generation and certification input', () => {
  const paths = runtimeHarnessPaths(PROFILE_PATH)
  assert.deepEqual(paths.map(path => relative(REPO_ROOT, path).split('\\').join('/')), [
    'infra/governance/lib/provider-runtime-conformance.mjs',
    'infra/governance/bin/conform-provider-runtime.mjs',
    'infra/governance/bin/promote-runtime-evidence.mjs',
    'infra/governance/providers/runtime-conformance.json',
    'infra/governance/providers/compatibility-matrix.json',
    'infra/governance/providers/provider-cli-toolchain.json',
    'infra/governance/providers/provider-cli-toolchain.package-lock.json',
    'infra/governance/schemas/provider-cli-toolchain.schema.json',
    'scripts/setup-provider-cli-toolchain.mjs',
    'infra/governance/lib/common.mjs',
    'infra/governance/lib/issuer-registry.mjs',
    'infra/governance/lib/repository-subject-proof.mjs',
    'infra/governance/lib/runtime-certification.mjs',
    'infra/governance/lib/external-surface-evidence.mjs',
    'infra/governance/lib/model-validation.mjs',
    'infra/governance/lib/role-surface-policy.mjs',
    'infra/governance/providers/role-surface-policy.json',
    'infra/governance/schemas/role-surface-policy.schema.json',
    'infra/governance/trust/issuers.json',
    'infra/governance/schemas/issuer-registry.schema.json',
    'infra/governance/schemas/runtime-conformance-profile.schema.json',
    'infra/governance/schemas/runtime-conformance-evidence.schema.json',
    'infra/governance/schemas/external-surface-evidence.schema.json',
    'infra/governance/schemas/provider-surface-certification.schema.json',
    'scripts/run-provider-hook.mjs',
    'generated/governance/provider-runtime-validator.mjs',
    'packages/governance/src/authority-decision-evidence.mjs',
    'packages/governance/src/canonical-order.mjs',
    'packages/governance/src/closed-tool-execution.mjs',
    'packages/governance/src/provider-hook-normalization.mjs',
    'packages/governance/src/provider-review-binding.mjs',
    'scripts/lib/canonical-path-containment.mjs',
    'scripts/lib/closed-tool-execution.mjs',
    'scripts/lib/provider-contract-validation.mjs',
    'scripts/lib/provider-hook-output-transport.mjs',
    'scripts/lib/provider-runtime-contract.mjs',
    'scripts/lib/provider-runtime-validation.mjs',
    'AGENTS.md',
    'packages/governance/canonical/providers.json',
    'packages/governance/canonical/schemas/providers.schema.json',
    'packages/design-system/ds-canonical/hooks/registrations.json',
    'packages/design-system/ds-canonical/hooks/registrations.schema.json',
    'scripts/schemas/provider-skill-semantics.schema.json',
    'scripts/lib/runtime-dependency-closure.mjs',
    'scripts/gen-codex-adapter.mjs',
    'scripts/provider-skill-semantics.json',
    'packages/design-system/ds-canonical/skills/canonical-reviewer/SKILL.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md',
    'packages/design-system/ds-canonical/adapters/claude/agents/canonical-reviewer.md',
    '.claude/skills/canonical-reviewer/SKILL.md',
    '.claude/agents/canonical-reviewer.md',
    'infra/governance/providers/review-capability-registry.json',
    'infra/governance/schemas/review-capability-registry.schema.json',
    'infra/governance/providers/model-invocation-profiles.json',
    'infra/governance/schemas/model-invocation-profiles.schema.json',
    'infra/governance/providers/model-release-registry.json',
    'infra/governance/schemas/model-release-registry.schema.json',
    'infra/governance/evidence/model-releases/anthropic-claude-5-capability-precedence.json',
    'packages/design-system/ds-canonical/hooks/governance_control_plane.sh',
    'packages/design-system/ds-canonical/hooks/check_canonical_propagation.sh',
    'packages/design-system/ds-canonical/hooks/_log-fire.sh',
    'packages/design-system/ds-canonical/hooks/session_start_governance_check.sh',
    'packages/design-system/ds-canonical/hooks/check_orphan_ds_css.sh',
    'packages/governance/package.json',
    'packages/governance/src/common.mjs',
    'packages/governance/src/contract.mjs',
    'packages/governance/src/hook-api.mjs',
    'governance/generated/adapters/claude-hook.mjs',
    'governance/generated/adapters/codex-hook.mjs',
  ])

  const canonicalManifest = readJson(resolve(REPO_ROOT, 'packages/governance/canonical/manifest.json'))
  const canonicalSources = new Map(canonicalManifest.sources.map(source => [source.id, source.path]))
  const exactCanonicalSourcePaths = new Set(canonicalManifest.sources.map(source => source.path))
  const canonicalSourceDirectories = canonicalManifest.sources
    .map(source => source.path)
    .filter(path => path.endsWith('/'))
  const runtimeHarnessRepoPaths = paths.map(path => relative(REPO_ROOT, path).split('\\').join('/'))
  const intentionallyFamilyOwnedRuntimeInput = path => (
    path.startsWith('packages/design-system/ds-canonical/hooks/')
      || path.startsWith('packages/design-system/ds-canonical/skills/')
      || path.startsWith('packages/design-system/ds-canonical/adapters/')
      || path.startsWith('.claude/')
      || path.startsWith('generated/')
      || path.startsWith('governance/generated/')
  )
  assert.deepEqual(
    runtimeHarnessRepoPaths
      .filter(path => !intentionallyFamilyOwnedRuntimeInput(path))
      .filter(path => (
        !exactCanonicalSourcePaths.has(path)
        && !canonicalSourceDirectories.some(directory => path.startsWith(directory))
      )),
    [],
    'every non-generated runtime harness input must have exact canonical manifest ownership',
  )
  assert.deepEqual(
    Object.fromEntries([
      'provider-cli-toolchain-authority',
      'provider-cli-toolchain-exact-lock',
      'provider-cli-toolchain-schema',
      'provider-runtime-conformance-profile',
      'provider-runtime-conformance-profile-schema',
    ].map(id => [id, canonicalSources.get(id)])),
    {
      'provider-cli-toolchain-authority': 'infra/governance/providers/provider-cli-toolchain.json',
      'provider-cli-toolchain-exact-lock': 'infra/governance/providers/provider-cli-toolchain.package-lock.json',
      'provider-cli-toolchain-schema': 'infra/governance/schemas/provider-cli-toolchain.schema.json',
      'provider-runtime-conformance-profile': 'infra/governance/providers/runtime-conformance.json',
      'provider-runtime-conformance-profile-schema': 'infra/governance/schemas/runtime-conformance-profile.schema.json',
    },
  )

  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'runtime-harness-digest-'))
  try {
    const copied = paths.map(path => {
      const destination = resolve(fixtureRoot, relative(REPO_ROOT, path))
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(path, destination)
      return destination
    })
    const baseline = computeRuntimeHarnessDigest(fixtureRoot, copied)
    const fixtureProfilePath = resolve(fixtureRoot, relative(REPO_ROOT, PROFILE_PATH))
    const baselineIdentity = runtimeHarnessIdentity(fixtureRoot, fixtureProfilePath, copied)
    const derivedFixturePaths = runtimeHarnessPaths(fixtureProfilePath)
    assert.deepEqual(
      derivedFixturePaths.map(path => relative(fixtureRoot, path)),
      copied.map(path => relative(fixtureRoot, path)),
      'fixture runtime Harness paths must derive from the supplied profile root, not the module installation root',
    )
    assert.deepEqual(
      runtimeHarnessIdentity(fixtureRoot, fixtureProfilePath),
      baselineIdentity,
      'default fixture runtime identity must use the fixture-root Harness closure',
    )
    const immutableBytes = new Map(copied.map(path => [
      relative(fixtureRoot, path).split('\\').join('/'),
      readFileSync(path),
    ]))
    const immutableProfile = readJson(fixtureProfilePath)
    const immutableIdentity = runtimeHarnessIdentityFromRepository({
      repoRoot: fixtureRoot,
      profile: immutableProfile,
      readRepoFile: path => Buffer.from(immutableBytes.get(path)),
      hasRepoFile: path => immutableBytes.has(path),
    })
    assert.deepEqual(immutableIdentity, baselineIdentity)
    const swapPath = resolve(fixtureRoot, 'infra/governance/lib/provider-runtime-conformance.mjs')
    const swapBytes = readFileSync(swapPath)
    writeFileSync(swapPath, Buffer.concat([swapBytes, Buffer.from('\nTOCTOU poison\n')]))
    assert.notDeepEqual(
      runtimeHarnessIdentity(fixtureRoot, fixtureProfilePath),
      baselineIdentity,
      'live runtime identity must observe a between-check mutation',
    )
    assert.deepEqual(
      runtimeHarnessIdentityFromRepository({
        repoRoot: fixtureRoot,
        profile: immutableProfile,
        readRepoFile: path => Buffer.from(immutableBytes.get(path)),
        hasRepoFile: path => immutableBytes.has(path),
      }),
      baselineIdentity,
      'immutable Git-object reader identity must remain pinned while live bytes are swapped',
    )
    writeFileSync(swapPath, swapBytes)
    assert.deepEqual(runtimeHarnessIdentity(fixtureRoot, fixtureProfilePath), baselineIdentity)
    assert.equal(computeRuntimeHarnessDigest(fixtureRoot, [...copied].reverse()), baseline, 'harness digest must be canonical over path order')
    assert.throws(
      () => computeRuntimeHarnessDigest(fixtureRoot, [...copied, resolve(fixtureRoot, 'missing-runtime-input.mjs')]),
      /regular non-symlink file/,
    )
    for (const path of copied) {
      assert.notEqual(
        computeRuntimeHarnessDigest(fixtureRoot, copied.filter(candidate => candidate !== path)),
        baseline,
        `closure omission must invalidate ${relative(fixtureRoot, path)}`,
      )
    }
    for (let index = 0; index < copied.length; index += 1) {
      const mutatedRoot = mkdtempSync(resolve(tmpdir(), 'runtime-harness-mutation-'))
      try {
        const mutated = copied.map(path => {
          const destination = resolve(mutatedRoot, relative(fixtureRoot, path))
          mkdirSync(dirname(destination), { recursive: true })
          copyFileSync(path, destination)
          return destination
        })
        writeFileSync(mutated[index], `${readFileSync(mutated[index], 'utf8')}\nmutation:${index}\n`)
        assert.notEqual(computeRuntimeHarnessDigest(mutatedRoot, mutated), baseline, `mutation must invalidate ${relative(fixtureRoot, copied[index])}`)
      } finally {
        rmSync(mutatedRoot, { recursive: true, force: true })
      }
    }

    const authorityMutationRoot = mkdtempSync(resolve(tmpdir(), 'runtime-profile-authority-mutation-'))
    try {
      const mutatedPaths = copied.map(path => {
        const destination = resolve(authorityMutationRoot, relative(fixtureRoot, path))
        mkdirSync(dirname(destination), { recursive: true })
        copyFileSync(path, destination)
        return destination
      })
      const manifestPath = resolve(authorityMutationRoot, 'infra/governance/providers/provider-cli-toolchain.json')
      const manifest = readJson(manifestPath)
      manifest.packageContent.packages[0].treeSha256 = 'f'.repeat(64)
      writeFileSync(manifestPath, `${stableStringify(manifest)}\n`)
      const mutatedIdentity = runtimeHarnessIdentity(
        authorityMutationRoot,
        resolve(authorityMutationRoot, relative(REPO_ROOT, PROFILE_PATH)),
        mutatedPaths,
      )
      assert.notEqual(mutatedIdentity.profileDigest, baselineIdentity.profileDigest, 'provider package-content authority must invalidate profile identity')
      assert.notEqual(mutatedIdentity.harnessDigest, baselineIdentity.harnessDigest, 'provider package-content authority must invalidate harness identity')
    } finally {
      rmSync(authorityMutationRoot, { recursive: true, force: true })
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('real generation to signed promotion to certification validation is closed, fresh, and replay-safe', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const issuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [{
      keyId: 'fixture-issuer',
      subject: 'fixture-runtime-authority',
      publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['runtime-evidence-issuer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    }],
  }
  const runtimeProfile = readJson(PROFILE_PATH)
  runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  runtimeProfile.allowedKeyIds = ['fixture-issuer']
  runtimeProfile.requiredIssuerQuorum = 1
  const profilePath = resolve(GOVERNANCE_ROOT, 'runtime/runtime-conformance-signed-fixture.json')
  const promotedRepo = mkdtempSync(resolve(tmpdir(), 'runtime-promoted-repo-'))
  const stagingPath = resolve(promotedRepo, 'staging.json')
  const localFleetStagingPath = resolve(promotedRepo, 'local-fleet-staging.json')
  const outputDirectory = resolve(promotedRepo, 'infra/governance/evidence/provider-runtime')
  try {
    writeFileSync(profilePath, `${stableStringify(runtimeProfile)}\n`)
    const cleanIdentity = { ...IDENTITY, worktreeDirty: false }
    const { evidence } = await runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath,
      providerFilter: 'codex',
      allowModel: true,
      runner: successMockRunner(),
      gitIdentityResolver: () => cleanIdentity,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => HOST,
      runIdResolver: () => RUN_ID,
      clock: () => RUN_AT,
      writeEvidence: false,
      issuerRegistry,
    })
    writeFileSync(stagingPath, `${stableStringify(evidence)}\n`)
    const identity = {
      gitCommit: evidence.subject.gitHead,
      gitTree: evidence.subject.gitTree,
      profileDigest: evidence.subject.profileDigest,
      harnessDigest: evidence.subject.harnessDigest,
    }
    const cleanPromotionGitIdentity = {
      gitHead: identity.gitCommit,
      gitTree: identity.gitTree,
      worktreeDirty: false,
    }
    const signature = sign(null, runtimeEvidenceSigningPayload(evidence, 'fixture-issuer'), privateKey).toString('base64')
    const attestation = {
      ...evidence.attestation,
      status: 'verified',
      issuerId: 'fixture-issuer',
      signature,
    }
    const signedNonProductionEvidence = attachRuntimeEvidenceAttestation(
      evidence,
      attestation,
      runtimeProfile,
      { issuerRegistry, now: PROMOTION_AT },
    )
    const signedNonProductionBytes = Buffer.from(`${stableStringify(signedNonProductionEvidence)}\n`)
    const signedNonProductionArtifactSha256 = sha256(signedNonProductionBytes)
    const signedNonProductionReference = `infra/governance/evidence/provider-runtime/${signedNonProductionArtifactSha256}.json`
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(resolve(promotedRepo, signedNonProductionReference), signedNonProductionBytes)

    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      runtimeProfile,
      issuerRegistry,
      attestation,
      now: PROMOTION_AT,
    }), /requires an explicit expected scope/)

    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      runtimeProfile,
      issuerRegistry,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    }), /attestation is pending/)

    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      runtimeProfile,
      issuerRegistry,
      attestation,
      expectedScope: 'local-fleet',
      now: PROMOTION_AT,
    }), /does not match explicit promotion scope local-fleet/)

    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      runtimeProfile,
      issuerRegistry,
      attestation,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    }), /non-production test seams cannot be promoted/)

    // The remaining signing/promotion assertions use an explicitly constructed issuer fixture
    // that represents evidence emitted by the production runner and repository authority.
    const productionEvidence = productionSafetyFixtureFromTestSeamEvidence(evidence)
    writeFileSync(stagingPath, `${stableStringify(productionEvidence)}\n`)
    const productionAttestation = {
      ...productionEvidence.attestation,
      status: 'verified',
      issuerId: 'fixture-issuer',
      signature: sign(
        null,
        runtimeEvidenceSigningPayload(productionEvidence, 'fixture-issuer'),
        privateKey,
      ).toString('base64'),
    }
    const escapedOutputDirectory = resolve(promotedRepo, 'outside-runtime-evidence')
    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory: escapedOutputDirectory,
      repoRoot: promotedRepo,
      identity,
      currentGitIdentity: cleanPromotionGitIdentity,
      runtimeProfile,
      issuerRegistry,
      attestation: productionAttestation,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    }), /must be the canonical repository content-addressed directory/)
    assert.equal(existsSync(escapedOutputDirectory), false, 'an out-of-bound promotion directory must not be created')

    const symlinkPromotionRepo = resolve(promotedRepo, 'symlink-promotion-repo')
    const symlinkTarget = resolve(promotedRepo, 'symlink-promotion-target')
    mkdirSync(resolve(symlinkPromotionRepo, 'infra/governance'), { recursive: true })
    mkdirSync(symlinkTarget)
    symlinkSync(symlinkTarget, resolve(symlinkPromotionRepo, 'infra/governance/evidence'))
    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory: resolve(symlinkPromotionRepo, 'infra/governance/evidence/provider-runtime'),
      repoRoot: symlinkPromotionRepo,
      identity,
      currentGitIdentity: cleanPromotionGitIdentity,
      runtimeProfile,
      issuerRegistry,
      attestation: productionAttestation,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    }), /parent chain contains a symlink or non-directory/)
    assert.equal(
      existsSync(resolve(symlinkTarget, 'provider-runtime')),
      false,
      'a symlinked promotion ancestor must not redirect directory creation outside the repository boundary',
    )
    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      currentGitIdentity: { ...cleanPromotionGitIdentity, worktreeDirty: true },
      runtimeProfile,
      issuerRegistry,
      attestation: productionAttestation,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    }), /requires the current worktree to remain clean/)
    const promoted = promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      currentGitIdentity: cleanPromotionGitIdentity,
      runtimeProfile,
      issuerRegistry,
      attestation: productionAttestation,
      expectedScope: 'provider',
      now: PROMOTION_AT,
    })
    assert.equal(promoted.scope, 'provider')
    const providerBinding = promoted.providerBindings.find(item => item.providerId === 'codex')

    const { evidence: localFleetEvidence } = await runRuntimeConformance({
      repoRoot: REPO_ROOT,
      profilePath,
      providerFilter: 'all',
      allowModel: true,
      runner: successMockRunner(),
      gitIdentityResolver: () => cleanIdentity,
      contractIdentityResolver: async () => CONTRACT,
      runtimeCertificationResolver: certificationIdentity,
      hostIdentityResolver: () => HOST,
      runIdResolver: () => '22222222-2222-4222-8222-222222222222',
      clock: () => RUN_AT,
      writeEvidence: false,
      issuerRegistry,
    })
    writeFileSync(localFleetStagingPath, `${stableStringify(localFleetEvidence)}\n`)
    const localFleetAttestation = {
      ...localFleetEvidence.attestation,
      status: 'verified',
      issuerId: 'fixture-issuer',
      signature: sign(
        null,
        runtimeEvidenceSigningPayload(localFleetEvidence, 'fixture-issuer'),
        privateKey,
      ).toString('base64'),
    }
    assert.throws(() => promoteRuntimeEvidence({
      source: localFleetStagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity: {
        gitCommit: localFleetEvidence.subject.gitHead,
        gitTree: localFleetEvidence.subject.gitTree,
        profileDigest: localFleetEvidence.subject.profileDigest,
        harnessDigest: localFleetEvidence.subject.harnessDigest,
      },
      runtimeProfile,
      issuerRegistry,
      attestation: localFleetAttestation,
      expectedScope: 'local-fleet',
      now: PROMOTION_AT,
    }), /non-production test seams cannot be promoted/)

    const productionLocalFleetEvidence = productionSafetyFixtureFromTestSeamEvidence(localFleetEvidence)
    writeFileSync(localFleetStagingPath, `${stableStringify(productionLocalFleetEvidence)}\n`)
    const productionLocalFleetAttestation = {
      ...productionLocalFleetEvidence.attestation,
      status: 'verified',
      issuerId: 'fixture-issuer',
      signature: sign(
        null,
        runtimeEvidenceSigningPayload(productionLocalFleetEvidence, 'fixture-issuer'),
        privateKey,
      ).toString('base64'),
    }
    const promotedLocalFleet = promoteRuntimeEvidence({
      source: localFleetStagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity: {
        gitCommit: productionLocalFleetEvidence.subject.gitHead,
        gitTree: productionLocalFleetEvidence.subject.gitTree,
        profileDigest: productionLocalFleetEvidence.subject.profileDigest,
        harnessDigest: productionLocalFleetEvidence.subject.harnessDigest,
      },
      currentGitIdentity: {
        gitHead: productionLocalFleetEvidence.subject.gitHead,
        gitTree: productionLocalFleetEvidence.subject.gitTree,
        worktreeDirty: false,
      },
      runtimeProfile,
      issuerRegistry,
      attestation: productionLocalFleetAttestation,
      expectedScope: 'local-fleet',
      now: PROMOTION_AT,
    })
    assert.equal(promotedLocalFleet.scope, 'local-fleet')
    assert.deepEqual(promotedLocalFleet.providerBindings.map(item => item.providerId).sort(), ['claude', 'codex'])
    assert.equal(
      promotedLocalFleet.providerBindings.some(item => item.providerId === 'codex-cloud'),
      false,
      'local-fleet promotion must never imply external-attested coverage',
    )

    const certification = {
      id: 'codex-signed-runtime-fixture',
      provider: 'codex',
      runtimeKind: 'codex-cli',
      providerVersion: '0.144.6',
      adapterVersion: 'governance-protocol-1',
      surface: 'local',
      repositoryRole: 'authority',
      status: 'certified',
      certifiedAt: '2026-07-27T09:15:00.000Z',
      expiresAt: '2026-07-27T20:00:00.000Z',
      platformMatrix: [{
        id: providerBinding.targetId,
        operatingSystem: providerBinding.operatingSystem,
        platform: providerBinding.platform,
        arch: providerBinding.arch,
        executionEnvironment: providerBinding.executionEnvironment,
        distributionVersion: providerBinding.distributionVersion,
        pathClass: providerBinding.pathClass,
        status: 'certified',
        limitations: [],
      }],
      runtimeEvidence: {
        reference: promoted.reference,
        artifactSha256: promoted.artifactSha256,
        evidenceDigest: promoted.evidenceDigest,
        providerId: 'codex',
        runId: promoted.runId,
        scope: promoted.scope,
        targetId: providerBinding.targetId,
        targetDigest: providerBinding.targetDigest,
        operatingSystem: providerBinding.operatingSystem,
        platform: providerBinding.platform,
        arch: providerBinding.arch,
        executionEnvironment: providerBinding.executionEnvironment,
        distributionVersion: providerBinding.distributionVersion,
        pathClass: providerBinding.pathClass,
        distributionDigest: providerBinding.distributionDigest,
        gitCommit: promoted.gitCommit,
        gitTree: promoted.gitTree,
        profileDigest: promoted.profileDigest,
        harnessDigest: promoted.harnessDigest,
        hardGateContractDigest: promoted.hardGateContractDigest,
      },
      checks: [{ id: 'runtime', status: 'pass', evidence: { kind: 'artifact-digest', reference: promoted.reference, sha256: promoted.artifactSha256 } }],
      limitations: [],
    }
    const ledger = { schemaVersion: 2, certifications: [certification] }
    const repositories = [
      { id: 'authority-canary', github: 'fixture/authority-canary', role: 'authority', defaultBranch: 'main' },
      { id: 'product-canary', github: 'fixture/product-canary', role: 'product-consumer', defaultBranch: 'main' },
    ]
    const inventory = {
      certificationCanaries: {
        authority: { repositoryId: 'authority-canary' },
        'product-consumer': { repositoryId: 'product-canary' },
      },
      repositories,
    }
    const externalRepositoryIdentities = Object.fromEntries(repositories.map(repository => [repository.id, {
      gitCommit: promoted.gitCommit,
      gitTree: promoted.gitTree,
      subjectProofs: {
        [promoted.gitCommit]: buildRepositorySubjectProof(repository, {
          subjectCommit: promoted.gitCommit,
          subjectTree: promoted.gitTree,
          carrierCommit: promoted.gitCommit,
          carrierTree: promoted.gitTree,
        }),
      },
    }]))
    const certificationValidationOptions = {
      now: PROMOTION_AT,
      repoRoot: promotedRepo,
      runtimeIdentity: identity,
      runtimeProfile,
      issuerRegistry,
      inventory,
      externalRepositoryIdentities,
    }
    const nonProductionLedger = structuredClone(ledger)
    nonProductionLedger.certifications[0].runtimeEvidence.reference = signedNonProductionReference
    nonProductionLedger.certifications[0].runtimeEvidence.artifactSha256 = signedNonProductionArtifactSha256
    nonProductionLedger.certifications[0].runtimeEvidence.evidenceDigest = signedNonProductionEvidence.evidenceDigest
    nonProductionLedger.certifications[0].checks[0].evidence.reference = signedNonProductionReference
    nonProductionLedger.certifications[0].checks[0].evidence.sha256 = signedNonProductionArtifactSha256
    assert.throws(
      () => validateCertifications(nonProductionLedger, certificationValidationOptions),
      /non-production test seams cannot be promoted or certified/,
    )
    assert.equal(validateCertifications(ledger, certificationValidationOptions), true)

    const missingPlatformBinding = structuredClone(ledger)
    delete missingPlatformBinding.certifications[0].runtimeEvidence.pathClass
    assert.throws(() => validateCertifications(missingPlatformBinding, certificationValidationOptions), /runtime evidence has an invalid or open shape/)

    const substitutedPlatform = structuredClone(ledger)
    substitutedPlatform.certifications[0].runtimeEvidence.platform = 'linux'
    assert.throws(() => validateCertifications(substitutedPlatform, certificationValidationOptions), /platform differs from the active runtime profile target/)

    const wrongPathClass = structuredClone(ledger)
    wrongPathClass.certifications[0].runtimeEvidence.pathClass = 'contains-space'
    assert.throws(() => validateCertifications(wrongPathClass, certificationValidationOptions), /pathClass differs from the active runtime profile target/)

    const wrongVersion = structuredClone(ledger)
    wrongVersion.certifications[0].runtimeEvidence.distributionVersion = '9.9.9'
    assert.throws(() => validateCertifications(wrongVersion, certificationValidationOptions), /distributionVersion differs from the active runtime profile target/)

    const wrongDistribution = structuredClone(ledger)
    wrongDistribution.certifications[0].runtimeEvidence.distributionDigest = `sha256:${'f'.repeat(64)}`
    assert.throws(() => validateCertifications(wrongDistribution, certificationValidationOptions), /runtime distribution binding mismatch/)

    const crossedScope = structuredClone(ledger)
    crossedScope.certifications[0].runtimeEvidence.scope = 'local-fleet'
    assert.throws(() => validateCertifications(crossedScope, certificationValidationOptions), /runtime evidence scope mismatch/)

    for (const mutate of [
      checks => { checks.pop() },
      checks => { checks.push({ id: 'unregistered-runtime-check', driver: 'provider-hook-adapter', requiresModel: false }) },
      checks => { checks[0].driver = 'provider-hook-adapter' },
    ]) {
      const driftedProfile = structuredClone(runtimeProfile)
      mutate(driftedProfile.providers.find(provider => provider.id === 'codex').checks)
      assert.throws(() => validateCertifications(ledger, {
        ...certificationValidationOptions,
        runtimeProfile: driftedProfile,
      }), /check coverage differs from the active runtime profile/)
    }

    assert.throws(() => promoteRuntimeEvidence({
      source: stagingPath,
      outputDirectory,
      repoRoot: promotedRepo,
      identity,
      runtimeProfile,
      issuerRegistry,
      attestation: productionAttestation,
      expectedScope: 'provider',
      now: new Date('2026-07-28T09:00:01.000Z'),
    }), /expired/)

    const replayed = structuredClone(certification)
    replayed.id = 'codex-signed-runtime-replay'
    replayed.repositoryRole = 'product-consumer'
    assert.throws(() => validateCertifications({ schemaVersion: 2, certifications: [certification, replayed] }, certificationValidationOptions), /replays runtime evidence/)

    const substituted = JSON.parse(readFileSync(resolve(promotedRepo, promoted.reference), 'utf8'))
    substituted.providers[0].tool.distribution.contentDigest = `sha256:${'f'.repeat(64)}`
    const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = substituted
    substituted.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
    substituted.attestation.evidenceDigest = substituted.evidenceDigest
    assert.throws(() => verifyRuntimeEvidenceAttestation(substituted, runtimeProfile, { issuerRegistry, now: PROMOTION_AT }), /signature verification failed/)
  } finally {
    rmSync(profilePath, { force: true })
    rmSync(promotedRepo, { recursive: true, force: true })
  }
})
